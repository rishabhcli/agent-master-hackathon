create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  status text not null default 'queued'
    check (status in ('queued', 'active', 'stopping', 'stopped', 'completed', 'error')),
  live_url_1 text,
  live_url_2 text,
  live_url_3 text,
  live_url_4 text,
  live_url_5 text,
  live_url_6 text,
  live_url_7 text,
  live_url_8 text,
  live_url_9 text,
  started_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  agent_id integer not null unique check (agent_id between 1 and 9),
  name text not null,
  platform text not null check (platform in ('tiktok', 'youtube', 'duckduckgo')),
  role text not null,
  status text not null default 'idle'
    check (status in ('idle', 'searching', 'found_trend', 'weak', 'reassigning', 'exploiting', 'stopped', 'error')),
  current_url text not null default '',
  preview_url text,
  profile_path text not null default '',
  session_id text,
  assignment text not null default '',
  energy integer not null default 100 check (energy between 0 and 100),
  last_discovery_keywords text[] not null default '{}',
  last_heartbeat timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.discoveries (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  agent_id integer not null check (agent_id between 1 and 9),
  platform text not null,
  title text not null default '',
  source_url text not null,
  thumbnail_url text not null default '',
  keywords text not null default '',
  likes bigint not null default 0,
  views bigint not null default 0,
  comments bigint not null default 0,
  summary text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  agent_id integer,
  type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  from_agent integer not null check (from_agent between 1 and 9),
  to_agent integer not null check (to_agent between 1 and 9),
  signal_type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.control_commands (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  command text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'handled', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  handled_at timestamptz
);

create index if not exists missions_created_at_idx on public.missions (created_at desc);
create index if not exists agents_mission_id_idx on public.agents (mission_id);
create index if not exists discoveries_created_at_idx on public.discoveries (created_at desc);
create index if not exists discoveries_mission_id_idx on public.discoveries (mission_id);
create index if not exists logs_created_at_idx on public.logs (created_at desc);
create index if not exists logs_mission_id_idx on public.logs (mission_id);
create index if not exists signals_created_at_idx on public.signals (created_at desc);
create index if not exists signals_mission_id_idx on public.signals (mission_id);
create index if not exists control_commands_status_idx on public.control_commands (status, created_at asc);

drop trigger if exists missions_set_updated_at on public.missions;
create trigger missions_set_updated_at
before update on public.missions
for each row
execute function public.set_updated_at();

drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at
before update on public.agents
for each row
execute function public.set_updated_at();

insert into realtime.channels (pattern, description, enabled)
values
  ('missions', 'Mission lifecycle events', true),
  ('agents', 'Agent state events', true),
  ('discoveries', 'Discovery events', true),
  ('logs', 'Log stream events', true),
  ('signals', 'Signal events', true),
  ('control_commands', 'Mission control commands', true)
on conflict (pattern) do update
set description = excluded.description,
    enabled = excluded.enabled;

create or replace function public.publish_masterbuild_change()
returns trigger
language plpgsql
security definer
as $$
declare
  payload jsonb;
  event_name text;
begin
  payload := case
    when tg_op = 'DELETE' then to_jsonb(old)
    else to_jsonb(new)
  end;

  event_name := tg_table_name || '_changed';

  perform realtime.publish(tg_table_name, event_name, payload);
  return coalesce(new, old);
end;
$$;

drop trigger if exists missions_realtime_trigger on public.missions;
create trigger missions_realtime_trigger
after insert or update or delete on public.missions
for each row
execute function public.publish_masterbuild_change();

drop trigger if exists agents_realtime_trigger on public.agents;
create trigger agents_realtime_trigger
after insert or update or delete on public.agents
for each row
execute function public.publish_masterbuild_change();

drop trigger if exists discoveries_realtime_trigger on public.discoveries;
create trigger discoveries_realtime_trigger
after insert or update or delete on public.discoveries
for each row
execute function public.publish_masterbuild_change();

drop trigger if exists logs_realtime_trigger on public.logs;
create trigger logs_realtime_trigger
after insert or update or delete on public.logs
for each row
execute function public.publish_masterbuild_change();

drop trigger if exists signals_realtime_trigger on public.signals;
create trigger signals_realtime_trigger
after insert or update or delete on public.signals
for each row
execute function public.publish_masterbuild_change();

drop trigger if exists control_commands_realtime_trigger on public.control_commands;
create trigger control_commands_realtime_trigger
after insert or update or delete on public.control_commands
for each row
execute function public.publish_masterbuild_change();

create or replace function public.reset_masterbuild()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.control_commands;
  delete from public.signals;
  delete from public.logs;
  delete from public.discoveries;
  delete from public.agents;
  delete from public.missions;
end;
$$;

create or replace function public.start_masterbuild_mission(mission_prompt text)
returns table (
  mission_id uuid,
  prompt text,
  status text
)
language plpgsql
security definer
as $$
declare
  v_mission_id uuid := gen_random_uuid();
  v_now timestamptz := timezone('utc', now());
begin
  perform public.reset_masterbuild();

  insert into public.missions (
    id,
    prompt,
    status,
    live_url_1,
    live_url_2,
    live_url_3,
    live_url_4,
    live_url_5,
    live_url_6,
    live_url_7,
    live_url_8,
    live_url_9,
    created_at,
    updated_at
  ) values (
    v_mission_id,
    mission_prompt,
    'queued',
    'http://localhost:3000/agent-stream/1',
    'http://localhost:3000/agent-stream/2',
    'http://localhost:3000/agent-stream/3',
    'http://localhost:3000/agent-stream/4',
    'http://localhost:3000/agent-stream/5',
    'http://localhost:3000/agent-stream/6',
    'http://localhost:3000/agent-stream/7',
    'http://localhost:3000/agent-stream/8',
    'http://localhost:3000/agent-stream/9',
    v_now,
    v_now
  );

  insert into public.agents (
    mission_id,
    agent_id,
    name,
    platform,
    role,
    status,
    preview_url,
    assignment,
    energy,
    created_at,
    updated_at,
    last_heartbeat
  ) values
    (v_mission_id, 1, 'Vibe',   'tiktok',     'Discovery',  'idle', 'http://localhost:3000/agent-stream/1', mission_prompt, 100, v_now, v_now, v_now),
    (v_mission_id, 2, 'Pulse',  'tiktok',     'Collection', 'idle', 'http://localhost:3000/agent-stream/2', mission_prompt, 100, v_now, v_now, v_now),
    (v_mission_id, 3, 'Rhythm', 'tiktok',     'Analysis',   'idle', 'http://localhost:3000/agent-stream/3', mission_prompt, 100, v_now, v_now, v_now),
    (v_mission_id, 4, 'Echo',   'youtube',    'Discovery',  'idle', 'http://localhost:3000/agent-stream/4', mission_prompt, 100, v_now, v_now, v_now),
    (v_mission_id, 5, 'Nova',   'youtube',    'Collection', 'idle', 'http://localhost:3000/agent-stream/5', mission_prompt, 100, v_now, v_now, v_now),
    (v_mission_id, 6, 'Blaze',  'youtube',    'Analysis',   'idle', 'http://localhost:3000/agent-stream/6', mission_prompt, 100, v_now, v_now, v_now),
    (v_mission_id, 7, 'Cipher', 'duckduckgo', 'Discovery',  'idle', 'http://localhost:3000/agent-stream/7', mission_prompt, 100, v_now, v_now, v_now),
    (v_mission_id, 8, 'Nexus',  'duckduckgo', 'Collection', 'idle', 'http://localhost:3000/agent-stream/8', mission_prompt, 100, v_now, v_now, v_now),
    (v_mission_id, 9, 'Oracle', 'duckduckgo', 'Analysis',   'idle', 'http://localhost:3000/agent-stream/9', mission_prompt, 100, v_now, v_now, v_now);

  insert into public.logs (mission_id, agent_id, type, message, metadata, created_at)
  values (
    v_mission_id,
    null,
    'status',
    'Mission queued and awaiting worker pickup.',
    jsonb_build_object('prompt', mission_prompt),
    v_now
  );

  return query
  select v_mission_id, mission_prompt, 'queued'::text;
end;
$$;
