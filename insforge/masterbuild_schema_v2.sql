-- MasterBuild v2 schema additions: agent memory, thoughts, business plans, builder outputs
-- Apply AFTER masterbuild_schema.sql

-- ── Agent Memory (InsForge-backed MD context) ─────────────────────────
create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  filename text not null,
  content text not null default '',
  version integer not null default 1,
  updated_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(mission_id, filename)
);

create index if not exists agent_memory_mission_id_idx on public.agent_memory (mission_id);
create index if not exists agent_memory_filename_idx on public.agent_memory (mission_id, filename);

drop trigger if exists agent_memory_set_updated_at on public.agent_memory;
create trigger agent_memory_set_updated_at
before update on public.agent_memory
for each row
execute function public.set_updated_at();

-- ── Agent Thoughts (LLM prompt/response observability) ────────────────
create table if not exists public.agent_thoughts (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  agent_id integer,
  thought_type text not null default 'inference'
    check (thought_type in ('inference', 'strategy', 'refinement', 'planning', 'action')),
  prompt_summary text not null default '',
  response_summary text not null default '',
  action_taken text not null default '',
  model text not null default '',
  tokens_used integer not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_thoughts_mission_id_idx on public.agent_thoughts (mission_id);
create index if not exists agent_thoughts_created_at_idx on public.agent_thoughts (created_at desc);
create index if not exists agent_thoughts_agent_id_idx on public.agent_thoughts (agent_id);

-- ── Business Plans (structured plan evolution) ────────────────────────
create table if not exists public.business_plans (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  version integer not null default 1,
  market_opportunity text not null default '',
  competitive_landscape text not null default '',
  revenue_models text not null default '',
  user_acquisition text not null default '',
  risk_analysis text not null default '',
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  discovery_count integer not null default 0,
  is_final boolean not null default false,
  raw_plan text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists business_plans_mission_id_idx on public.business_plans (mission_id);
create index if not exists business_plans_created_at_idx on public.business_plans (created_at desc);

-- ── Builder Outputs (app building stages) ─────────────────────────────
create table if not exists public.builder_outputs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  stage text not null check (stage in ('schema', 'scaffold', 'features', 'deploy', 'monetization')),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'error')),
  output_data jsonb not null default '{}'::jsonb,
  error_message text,
  deploy_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists builder_outputs_mission_id_idx on public.builder_outputs (mission_id);

drop trigger if exists builder_outputs_set_updated_at on public.builder_outputs;
create trigger builder_outputs_set_updated_at
before update on public.builder_outputs
for each row
execute function public.set_updated_at();

-- ── Realtime channels for new tables ──────────────────────────────────
insert into realtime.channels (pattern, description, enabled)
values
  ('agent_memory', 'Agent shared memory context events', true),
  ('agent_thoughts', 'Agent LLM thought observability events', true),
  ('business_plans', 'Business plan evolution events', true),
  ('builder_outputs', 'Builder agent output events', true)
on conflict (pattern) do update
set description = excluded.description,
    enabled = excluded.enabled;

-- ── Realtime triggers for new tables ──────────────────────────────────
drop trigger if exists agent_memory_realtime_trigger on public.agent_memory;
create trigger agent_memory_realtime_trigger
after insert or update or delete on public.agent_memory
for each row
execute function public.publish_masterbuild_change();

drop trigger if exists agent_thoughts_realtime_trigger on public.agent_thoughts;
create trigger agent_thoughts_realtime_trigger
after insert or update or delete on public.agent_thoughts
for each row
execute function public.publish_masterbuild_change();

drop trigger if exists business_plans_realtime_trigger on public.business_plans;
create trigger business_plans_realtime_trigger
after insert or update or delete on public.business_plans
for each row
execute function public.publish_masterbuild_change();

drop trigger if exists builder_outputs_realtime_trigger on public.builder_outputs;
create trigger builder_outputs_realtime_trigger
after insert or update or delete on public.builder_outputs
for each row
execute function public.publish_masterbuild_change();

-- ── Update reset function to include new tables ───────────────────────
create or replace function public.reset_masterbuild()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.builder_outputs;
  delete from public.business_plans;
  delete from public.agent_thoughts;
  delete from public.agent_memory;
  delete from public.control_commands;
  delete from public.signals;
  delete from public.logs;
  delete from public.discoveries;
  delete from public.agents;
  delete from public.missions;
end;
$$;
