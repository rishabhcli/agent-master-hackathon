-- MasterBuild RLS Policies — Production Security
-- Apply AFTER masterbuild_schema.sql and masterbuild_schema_v2.sql
-- Already applied to the production backend via InsForge MCP on 2026-04-05.

-- Enable RLS on all tables
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_outputs ENABLE ROW LEVEL SECURITY;

-- ── Missions ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS missions_select_authenticated ON public.missions;
CREATE POLICY missions_select_authenticated ON public.missions
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS missions_insert_service ON public.missions;
CREATE POLICY missions_insert_service ON public.missions
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS missions_update_service ON public.missions;
CREATE POLICY missions_update_service ON public.missions
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS missions_delete_service ON public.missions;
CREATE POLICY missions_delete_service ON public.missions
  FOR DELETE TO authenticated, anon USING (true);

-- ── Agents ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS agents_select_all ON public.agents;
CREATE POLICY agents_select_all ON public.agents
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS agents_insert_all ON public.agents;
CREATE POLICY agents_insert_all ON public.agents
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS agents_update_all ON public.agents;
CREATE POLICY agents_update_all ON public.agents
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agents_delete_all ON public.agents;
CREATE POLICY agents_delete_all ON public.agents
  FOR DELETE TO authenticated, anon USING (true);

-- ── Discoveries ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS discoveries_select_all ON public.discoveries;
CREATE POLICY discoveries_select_all ON public.discoveries
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS discoveries_insert_all ON public.discoveries;
CREATE POLICY discoveries_insert_all ON public.discoveries
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS discoveries_delete_all ON public.discoveries;
CREATE POLICY discoveries_delete_all ON public.discoveries
  FOR DELETE TO authenticated, anon USING (true);

-- ── Logs ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS logs_select_all ON public.logs;
CREATE POLICY logs_select_all ON public.logs
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS logs_insert_all ON public.logs;
CREATE POLICY logs_insert_all ON public.logs
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS logs_delete_all ON public.logs;
CREATE POLICY logs_delete_all ON public.logs
  FOR DELETE TO authenticated, anon USING (true);

-- ── Signals ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS signals_select_all ON public.signals;
CREATE POLICY signals_select_all ON public.signals
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS signals_insert_all ON public.signals;
CREATE POLICY signals_insert_all ON public.signals
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS signals_delete_all ON public.signals;
CREATE POLICY signals_delete_all ON public.signals
  FOR DELETE TO authenticated, anon USING (true);

-- ── Control Commands ──────────────────────────────────────────────────
DROP POLICY IF EXISTS control_commands_select_all ON public.control_commands;
CREATE POLICY control_commands_select_all ON public.control_commands
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS control_commands_insert_all ON public.control_commands;
CREATE POLICY control_commands_insert_all ON public.control_commands
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS control_commands_update_all ON public.control_commands;
CREATE POLICY control_commands_update_all ON public.control_commands
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS control_commands_delete_all ON public.control_commands;
CREATE POLICY control_commands_delete_all ON public.control_commands
  FOR DELETE TO authenticated, anon USING (true);

-- ── Agent Memory ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS agent_memory_select_all ON public.agent_memory;
CREATE POLICY agent_memory_select_all ON public.agent_memory
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS agent_memory_insert_all ON public.agent_memory;
CREATE POLICY agent_memory_insert_all ON public.agent_memory
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS agent_memory_update_all ON public.agent_memory;
CREATE POLICY agent_memory_update_all ON public.agent_memory
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_memory_delete_all ON public.agent_memory;
CREATE POLICY agent_memory_delete_all ON public.agent_memory
  FOR DELETE TO authenticated, anon USING (true);

-- ── Agent Thoughts ────────────────────────────────────────────────────
DROP POLICY IF EXISTS agent_thoughts_select_all ON public.agent_thoughts;
CREATE POLICY agent_thoughts_select_all ON public.agent_thoughts
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS agent_thoughts_insert_all ON public.agent_thoughts;
CREATE POLICY agent_thoughts_insert_all ON public.agent_thoughts
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS agent_thoughts_delete_all ON public.agent_thoughts;
CREATE POLICY agent_thoughts_delete_all ON public.agent_thoughts
  FOR DELETE TO authenticated, anon USING (true);

-- ── Business Plans ────────────────────────────────────────────────────
DROP POLICY IF EXISTS business_plans_select_all ON public.business_plans;
CREATE POLICY business_plans_select_all ON public.business_plans
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS business_plans_insert_all ON public.business_plans;
CREATE POLICY business_plans_insert_all ON public.business_plans
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS business_plans_delete_all ON public.business_plans;
CREATE POLICY business_plans_delete_all ON public.business_plans
  FOR DELETE TO authenticated, anon USING (true);

-- ── Builder Outputs ───────────────────────────────────────────────────
DROP POLICY IF EXISTS builder_outputs_select_all ON public.builder_outputs;
CREATE POLICY builder_outputs_select_all ON public.builder_outputs
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS builder_outputs_insert_all ON public.builder_outputs;
CREATE POLICY builder_outputs_insert_all ON public.builder_outputs
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS builder_outputs_update_all ON public.builder_outputs;
CREATE POLICY builder_outputs_update_all ON public.builder_outputs
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS builder_outputs_delete_all ON public.builder_outputs;
CREATE POLICY builder_outputs_delete_all ON public.builder_outputs
  FOR DELETE TO authenticated, anon USING (true);
