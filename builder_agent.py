"""Builder Agent (Agent 6 — Forge): reads the business plan and builds an app via InsForge.

This agent is triggered once the business plan reaches sufficient confidence.
It generates: database schema SQL, app scaffold, feature specs, deployment, and monetization.
It then EXECUTES the schema on InsForge and loops to refine until proficiency target is met.
All outputs are written to builder_outputs in InsForge and to runtime/context/builder_report.md.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import agent_context

# Stages the builder progresses through per iteration
STAGES = ("schema", "scaffold", "features", "deploy", "monetization")
PROFICIENCY_TARGET = 75  # out of 100 — loop until we hit this
MAX_ITERATIONS = 3


class BuilderAgent:
    """Orchestrates the app-building pipeline using MiniMax for code generation."""

    def __init__(self, ai: Any, client: Any, mission_id: str, prompt: str) -> None:
        self.ai = ai  # MasterBuildAI instance
        self.client = client  # InsForgeRuntimeClient instance
        self.mission_id = mission_id
        self.prompt = prompt
        self.agent_id = 6
        self._outputs: dict[str, Any] = {}
        self._iteration = 0
        self._proficiency = 0

    async def run(self, stop_event: asyncio.Event) -> dict[str, Any]:
        """Execute the builder pipeline with refinement loop.

        Loop: build → evaluate proficiency → refine → rebuild until target met.
        """
        business_plan = agent_context.get_business_plan()
        if not business_plan or "Pending" in business_plan[:200]:
            return {"error": "Business plan not ready yet"}

        agent_context.log_agent_action(self.agent_id, "start", "Builder agent activated")
        await self.client.append_log(
            self.mission_id, agent_id=self.agent_id, log_type="status",
            message=f"🔨 Forge activated — building from business plan (target: {PROFICIENCY_TARGET}% proficiency)",
            metadata={},
        )

        while self._iteration < MAX_ITERATIONS and not stop_event.is_set():
            self._iteration += 1
            # Re-read business plan each iteration (it may have been refined by research agents)
            business_plan = agent_context.get_business_plan()

            await self.client.append_log(
                self.mission_id, agent_id=self.agent_id, log_type="status",
                message=f"🔄 Build iteration {self._iteration}/{MAX_ITERATIONS}",
                metadata={"iteration": self._iteration},
            )

            # Execute all stages
            for stage in STAGES:
                if stop_event.is_set():
                    break
                try:
                    await self._set_stage_status(stage, "in_progress")
                    output = await self._execute_stage(stage, business_plan)
                    self._outputs[stage] = output
                    await self._set_stage_status(stage, "completed", output)
                    agent_context.log_agent_action(self.agent_id, stage, f"Completed: {str(output)[:100]}")
                    await self.client.append_log(
                        self.mission_id, agent_id=self.agent_id, log_type="status",
                        message=f"✅ [{self._iteration}] Stage '{stage}' completed",
                        metadata={"stage": stage, "iteration": self._iteration},
                    )
                except Exception as e:
                    await self._set_stage_status(stage, "error", {"error": str(e)})
                    agent_context.log_agent_action(self.agent_id, "error", f"Stage {stage}: {e}")
                    await self.client.append_log(
                        self.mission_id, agent_id=self.agent_id, log_type="error",
                        message=f"Builder stage '{stage}' failed: {e}",
                        metadata={"stage": stage},
                    )

            # Execute the schema on InsForge
            if not stop_event.is_set():
                await self._execute_schema_on_insforge()

            # Evaluate proficiency
            if not stop_event.is_set():
                self._proficiency = await self._evaluate_proficiency(business_plan)
                await self.client.append_log(
                    self.mission_id, agent_id=self.agent_id, log_type="status",
                    message=f"📊 Proficiency: {self._proficiency}% (target: {PROFICIENCY_TARGET}%)",
                    metadata={"proficiency": self._proficiency, "iteration": self._iteration},
                )

                if self._proficiency >= PROFICIENCY_TARGET:
                    await self.client.append_log(
                        self.mission_id, agent_id=self.agent_id, log_type="status",
                        message=f"🎯 Proficiency target reached! {self._proficiency}% >= {PROFICIENCY_TARGET}%",
                        metadata={},
                    )
                    break

                # Not yet at target — generate refinement feedback for next iteration
                if self._iteration < MAX_ITERATIONS:
                    await self._generate_refinement_feedback(business_plan)

        # Write final summary
        self._write_builder_report()
        return self._outputs

    async def _execute_stage(self, stage: str, business_plan: str) -> dict[str, Any]:
        if stage == "schema":
            return await self._stage_schema(business_plan)
        elif stage == "scaffold":
            return await self._stage_scaffold(business_plan)
        elif stage == "features":
            return await self._stage_features(business_plan)
        elif stage == "deploy":
            return await self._stage_deploy(business_plan)
        elif stage == "monetization":
            return await self._stage_monetization(business_plan)
        return {"error": f"Unknown stage: {stage}"}

    async def _execute_schema_on_insforge(self) -> None:
        """Actually create the database tables on InsForge."""
        schema = self._outputs.get("schema", {})
        sql = schema.get("sql", "")
        if not sql:
            return
        try:
            await self.client.execute_sql(sql)
            await self.client.append_log(
                self.mission_id, agent_id=self.agent_id, log_type="status",
                message="🗄️ Database schema applied to InsForge",
                metadata={"tables": [t.get("name") for t in schema.get("tables", [])]},
            )
            agent_context.log_agent_action(self.agent_id, "deploy", "Schema applied to InsForge DB")
        except Exception as e:
            await self.client.append_log(
                self.mission_id, agent_id=self.agent_id, log_type="error",
                message=f"Schema execution failed (non-fatal): {e}",
                metadata={},
            )

    async def _evaluate_proficiency(self, business_plan: str) -> int:
        """Use MiniMax to evaluate the current build's proficiency score."""
        system = (
            "You are a technical evaluator. Rate the quality of this app design on a scale of 0-100.\n"
            "Consider: schema completeness, feature coverage, monetization viability, "
            "alignment with the business plan, and deployment readiness.\n"
            "Return ONLY a JSON object: {\"score\": <int>, \"gaps\": [<string>], \"strengths\": [<string>]}"
        )
        outputs_summary = json.dumps({
            stage: {k: str(v)[:200] for k, v in output.items()} if isinstance(output, dict) else str(output)[:200]
            for stage, output in self._outputs.items()
        }, indent=1)
        user = (
            f"BUSINESS PLAN:\n{business_plan[:1500]}\n\n"
            f"BUILD OUTPUTS:\n{outputs_summary[:3000]}\n\n"
            "Evaluate proficiency."
        )
        try:
            raw = await self.ai.generate_chat_completion(
                system, user, max_tokens=500,
                thought_type="refinement", agent_id=self.agent_id, action_label="proficiency_eval",
            )
            from masterbuild_runtime import extract_json_block
            result = extract_json_block(raw)
            score = int(result.get("score", 0))
            self._outputs["proficiency_eval"] = result
            return min(max(score, 0), 100)
        except Exception:
            return 50  # Default if evaluation fails

    async def _generate_refinement_feedback(self, business_plan: str) -> None:
        """Generate feedback to improve the next iteration."""
        eval_result = self._outputs.get("proficiency_eval", {})
        gaps = eval_result.get("gaps", [])
        if not gaps:
            return

        feedback = f"Iteration {self._iteration} gaps: {', '.join(gaps[:5])}"
        agent_context.log_agent_action(self.agent_id, "refinement", feedback)
        await self.client.append_log(
            self.mission_id, agent_id=self.agent_id, log_type="refinement",
            message=f"🔧 Refinement needed: {feedback}",
            metadata={"gaps": gaps},
        )
        # Signal research agents to dig deeper on gaps
        for gap in gaps[:3]:
            try:
                await self.client.append_signal(
                    self.mission_id, from_agent=self.agent_id, to_agent=0,
                    signal_type="research_request",
                    message=f"Builder needs more research on: {gap}",
                    payload={"gap": gap, "iteration": self._iteration},
                )
            except Exception:
                pass

    async def _stage_schema(self, business_plan: str) -> dict[str, Any]:
        prev_schema = self._outputs.get("schema", {})
        refinement_context = ""
        if prev_schema and self._iteration > 1:
            eval_result = self._outputs.get("proficiency_eval", {})
            gaps = eval_result.get("gaps", [])
            refinement_context = f"\n\nPREVIOUS GAPS TO ADDRESS:\n" + "\n".join(f"- {g}" for g in gaps)

        system = (
            "You are a database architect. Given a business plan, design a PostgreSQL schema.\n"
            "Return ONLY a JSON object with:\n"
            '  "tables": array of {name, columns: [{name, type, constraints}], description}\n'
            '  "sql": the full CREATE TABLE SQL as a single string (use IF NOT EXISTS)\n'
            '  "reasoning": why these tables support the business model\n'
        )
        user = f"BUSINESS PLAN:\n{business_plan[:3000]}\n\nDesign the database schema.{refinement_context}"
        raw = await self.ai.generate_chat_completion(
            system, user, max_tokens=2000,
            thought_type="planning", agent_id=self.agent_id, action_label="schema_design",
        )
        from masterbuild_runtime import extract_json_block
        return extract_json_block(raw)

    async def _stage_scaffold(self, business_plan: str) -> dict[str, Any]:
        schema_output = self._outputs.get("schema", {})
        system = (
            "You are a frontend architect. Given a business plan and database schema, "
            "design a Next.js app structure.\n"
            "Return ONLY a JSON object with:\n"
            '  "pages": array of {route, title, description, components}\n'
            '  "components": array of {name, props, description}\n'
            '  "auth_required": boolean\n'
            '  "tech_stack": object with framework, styling, state_management\n'
        )
        user = (
            f"BUSINESS PLAN:\n{business_plan[:2000]}\n\n"
            f"DATABASE SCHEMA:\n{json.dumps(schema_output.get('tables', []))[:1000]}\n\n"
            "Design the app scaffold."
        )
        raw = await self.ai.generate_chat_completion(
            system, user, max_tokens=2000,
            thought_type="planning", agent_id=self.agent_id, action_label="scaffold_design",
        )
        from masterbuild_runtime import extract_json_block
        return extract_json_block(raw)

    async def _stage_features(self, business_plan: str) -> dict[str, Any]:
        scaffold = self._outputs.get("scaffold", {})
        system = (
            "You are a product engineer. Given a business plan and app scaffold, "
            "specify the key features with implementation details.\n"
            "Return ONLY a JSON object with:\n"
            '  "features": array of {name, description, priority, insforge_services: [db/auth/storage/ai/realtime], implementation_notes}\n'
            '  "mvp_features": array of feature names for v1\n'
            '  "insforge_config": {auth_providers, storage_buckets, realtime_channels}\n'
        )
        user = (
            f"BUSINESS PLAN:\n{business_plan[:1500]}\n\n"
            f"APP SCAFFOLD:\n{json.dumps(scaffold)[:1500]}\n\n"
            "Specify the features. Use InsForge services: database, auth, storage, AI, realtime."
        )
        raw = await self.ai.generate_chat_completion(
            system, user, max_tokens=2000,
            thought_type="planning", agent_id=self.agent_id, action_label="feature_spec",
        )
        from masterbuild_runtime import extract_json_block
        return extract_json_block(raw)

    async def _stage_deploy(self, business_plan: str) -> dict[str, Any]:
        features = self._outputs.get("features", {})
        schema = self._outputs.get("schema", {})
        system = (
            "You are a DevOps engineer. Given the app features and schema, "
            "create a deployment plan for InsForge hosting.\n"
            "Return ONLY a JSON object with:\n"
            '  "deployment_steps": array of {step, command_or_action, description}\n'
            '  "environment_variables": array of {name, description, required}\n'
            '  "estimated_cost": string\n'
            '  "go_live_checklist": array of strings\n'
        )
        user = (
            f"BUSINESS PLAN:\n{business_plan[:1000]}\n\n"
            f"SCHEMA SQL:\n{str(schema.get('sql', ''))[:800]}\n\n"
            f"FEATURES:\n{json.dumps(features.get('mvp_features', []))[:500]}\n\n"
            "Create the deployment plan for InsForge."
        )
        raw = await self.ai.generate_chat_completion(
            system, user, max_tokens=1500,
            thought_type="planning", agent_id=self.agent_id, action_label="deploy_plan",
        )
        from masterbuild_runtime import extract_json_block
        return extract_json_block(raw)

    async def _stage_monetization(self, business_plan: str) -> dict[str, Any]:
        system = (
            "You are a monetization strategist. Given the business plan and app features, "
            "design a concrete monetization and pricing strategy.\n"
            "Return ONLY a JSON object with:\n"
            '  "pricing_tiers": array of {name, price, billing_cycle, features, target_audience}\n'
            '  "revenue_streams": array of {source, model, estimated_monthly_revenue}\n'
            '  "payment_integration": {provider, setup_steps}\n'
            '  "growth_levers": array of strings\n'
            '  "unit_economics": {cac, ltv, margin_percent}\n'
        )
        features = self._outputs.get("features", {})
        user = (
            f"BUSINESS PLAN:\n{business_plan[:2000]}\n\n"
            f"MVP FEATURES:\n{json.dumps(features.get('mvp_features', []))[:500]}\n\n"
            "Design the monetization strategy."
        )
        raw = await self.ai.generate_chat_completion(
            system, user, max_tokens=1500,
            thought_type="refinement", agent_id=self.agent_id, action_label="monetization",
        )
        from masterbuild_runtime import extract_json_block
        return extract_json_block(raw)

    async def _set_stage_status(self, stage: str, status: str, output: Any = None) -> None:
        try:
            existing = await self.client.list_records(
                "builder_outputs",
                params={
                    "mission_id": f"eq.{self.mission_id}",
                    "stage": f"eq.{stage}",
                    "limit": 1,
                },
            )
            values: dict[str, Any] = {"status": status}
            if output is not None:
                values["output_data"] = output if isinstance(output, dict) else {"raw": str(output)[:5000]}
            if status == "error" and output and isinstance(output, dict):
                values["error_message"] = output.get("error", "")[:500]

            if existing:
                await self.client.update_records(
                    "builder_outputs",
                    filters={"id": f"eq.{existing[0]['id']}"},
                    values=values,
                )
            else:
                values.update({
                    "mission_id": self.mission_id,
                    "stage": stage,
                })
                await self.client.insert_records("builder_outputs", [values])
        except Exception as e:
            print(f"[builder] stage status update error: {e}")

    def _write_builder_report(self) -> None:
        lines = [
            f"# Builder Report (Iteration {self._iteration}, Proficiency {self._proficiency}%)\n\n"
        ]
        for stage in STAGES:
            output = self._outputs.get(stage)
            if output is None:
                lines.append(f"## {stage.title()}\n\n_Not started._\n\n")
            elif isinstance(output, dict) and "error" in output:
                lines.append(f"## {stage.title()}\n\n❌ Error: {output['error']}\n\n")
            else:
                preview = json.dumps(output, indent=2)[:600] if isinstance(output, dict) else str(output)[:600]
                lines.append(f"## {stage.title()}\n\n```json\n{preview}\n```\n\n")

        eval_result = self._outputs.get("proficiency_eval", {})
        if eval_result:
            lines.append(f"## Proficiency Evaluation\n\n")
            lines.append(f"- Score: {eval_result.get('score', '?')}%\n")
            lines.append(f"- Strengths: {', '.join(eval_result.get('strengths', []))}\n")
            lines.append(f"- Gaps: {', '.join(eval_result.get('gaps', []))}\n")

        agent_context.write_md("builder_report.md", "".join(lines), updated_by="builder")
