"""Builder Agent (Agent 6 — Forge): reads the business plan and designs an app via InsForge.

This agent is triggered once the business plan reaches sufficient confidence.
It generates: database schema SQL, app feature specs, and deployment instructions.
All outputs are written to builder_outputs in InsForge and to runtime/context/builder_report.md.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import agent_context

# Stages the builder progresses through
STAGES = ("schema", "scaffold", "features", "deploy", "monetization")


class BuilderAgent:
    """Orchestrates the app-building pipeline using MiniMax for code generation."""

    def __init__(self, ai: Any, client: Any, mission_id: str, prompt: str) -> None:
        self.ai = ai  # MasterBuildAI instance
        self.client = client  # InsForgeRuntimeClient instance
        self.mission_id = mission_id
        self.prompt = prompt
        self.agent_id = 6
        self._outputs: dict[str, Any] = {}

    async def run(self, stop_event: asyncio.Event) -> dict[str, Any]:
        """Execute the full builder pipeline. Returns a dict of stage → output."""
        business_plan = agent_context.get_business_plan()
        if not business_plan or "Pending" in business_plan[:200]:
            return {"error": "Business plan not ready yet"}

        agent_context.log_agent_action(self.agent_id, "start", "Builder agent activated")
        await self.client.append_log(
            self.mission_id, agent_id=self.agent_id, log_type="status",
            message="🔨 Forge (Builder Agent) activated — designing app from business plan",
            metadata={},
        )

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
                    message=f"✅ Builder stage '{stage}' completed",
                    metadata={"stage": stage},
                )
            except Exception as e:
                await self._set_stage_status(stage, "error", {"error": str(e)})
                agent_context.log_agent_action(self.agent_id, "error", f"Stage {stage}: {e}")
                await self.client.append_log(
                    self.mission_id, agent_id=self.agent_id, log_type="error",
                    message=f"Builder stage '{stage}' failed: {e}",
                    metadata={"stage": stage},
                )

        # Write summary report
        self._write_builder_report()
        return self._outputs

    async def _execute_stage(self, stage: str, business_plan: str) -> dict[str, Any]:
        """Dispatch to the appropriate stage handler."""
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

    async def _stage_schema(self, business_plan: str) -> dict[str, Any]:
        """Generate database schema SQL from the business plan."""
        system = (
            "You are a database architect. Given a business plan, design a PostgreSQL schema.\n"
            "Return ONLY a JSON object with:\n"
            '  "tables": array of {name, columns: [{name, type, constraints}], description}\n'
            '  "sql": the full CREATE TABLE SQL as a single string\n'
            '  "reasoning": why these tables support the business model\n'
        )
        user = f"BUSINESS PLAN:\n{business_plan[:3000]}\n\nDesign the database schema."
        raw = await self.ai.generate_chat_completion(
            system, user, max_tokens=2000,
            thought_type="planning", agent_id=self.agent_id, action_label="schema_design",
        )
        from masterbuild_runtime import extract_json_block
        return extract_json_block(raw)

    async def _stage_scaffold(self, business_plan: str) -> dict[str, Any]:
        """Generate app scaffold specification."""
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
        """Generate feature specifications with InsForge SDK integration patterns."""
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
        """Generate deployment plan and instructions."""
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
        """Generate monetization strategy and pricing model."""
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
        """Update builder_outputs in InsForge."""
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
        """Write a summary report to runtime/context/builder_report.md."""
        lines = ["# Builder Report\n\n"]
        for stage in STAGES:
            output = self._outputs.get(stage)
            if output is None:
                lines.append(f"## {stage.title()}\n\n_Not started._\n\n")
            elif isinstance(output, dict) and "error" in output:
                lines.append(f"## {stage.title()}\n\n❌ Error: {output['error']}\n\n")
            else:
                preview = json.dumps(output, indent=2)[:600] if isinstance(output, dict) else str(output)[:600]
                lines.append(f"## {stage.title()}\n\n```json\n{preview}\n```\n\n")
        agent_context.write_md("builder_report.md", "".join(lines), updated_by="builder")