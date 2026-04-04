"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getInsforgeConfigError, hasInsforgeConfig, insforge } from "../lib/insforge";
import type { AgentData, AgentMemoryEntry, AgentSignal, AgentThought, BusinessPlan, DiscoveredContent, LogEntry } from "./useAgentData";

export interface FinalOptionEvidence {
  id: string;
  platform: string;
  title: string;
  keywords: string;
  summary: string;
  url: string;
}

export interface FinalOption {
  id: string;
  title: string;
  concept: string;
  audience: string;
  whyPromising: string;
  marketAngle: string;
  recommendedFormat: string;
  evidence: FinalOptionEvidence[];
}

export interface FinalOptionsCoverage {
  requiredPlatforms: readonly ("youtube" | "x" | "reddit" | "substack")[];
  completedPlatforms: string[];
  missingPlatforms: string[];
  readyForLovable: boolean;
}

export interface ImplementationPlanScreen {
  name: string;
  purpose: string;
  modules: string[];
}

export interface ImplementationPlanDataModel {
  entity: string;
  purpose: string;
  fields: string[];
}

export interface ImplementationPlanWorkflow {
  name: string;
  trigger: string;
  outcome: string;
}

export interface FinalImplementationPlan {
  generatedBy: "MiniMax-M2.7";
  title: string;
  oneLiner: string;
  problem: string;
  targetUsers: string;
  valueProp: string;
  whyNow: string;
  coreUserFlows: string[];
  screens: ImplementationPlanScreen[];
  dataModel: ImplementationPlanDataModel[];
  workflows: ImplementationPlanWorkflow[];
  integrations: string[];
  monetization: string;
  launchPlan: string[];
  successMetrics: string[];
  sourceEvidence: FinalOptionEvidence[];
}

export interface LovableHandoff {
  title: string;
  prompt: string;
  launchUrl: string;
  evidence: FinalOptionEvidence[];
}

export interface FinalOptionsPayload {
  generatedAt: string;
  isFinal: boolean;
  marketResearch: {
    summary: string;
    signals: string[];
  };
  options: FinalOption[];
  primaryOptionId: string;
  coverage: FinalOptionsCoverage;
  implementationPlan: FinalImplementationPlan;
  lovableHandoff: LovableHandoff;
}

interface MissionRecord {
  id: string;
  prompt: string;
  status: "queued" | "active" | "stopping" | "stopped" | "completed" | "error";
  liveUrl: string | null;
  liveUrl2: string | null;
  liveUrl3: string | null;
  liveUrl4: string | null;
  liveUrl5: string | null;
  finalOptions: FinalOptionsPayload | null;
}

const REALTIME_CHANNELS = [
  "missions", "agents", "discoveries", "logs", "signals",
  "agent_memory", "agent_thoughts", "business_plans", "builder_outputs"
] as const;
const REALTIME_EVENTS = REALTIME_CHANNELS.map((channel) => `${channel}_changed`);
let realtimeSetupPromise: Promise<void> | null = null;

async function ensureRealtimeReady() {
  if (realtimeSetupPromise) {
    return realtimeSetupPromise;
  }

  realtimeSetupPromise = (async () => {
    await insforge.realtime.connect();

    for (const channel of REALTIME_CHANNELS) {
      const result = await insforge.realtime.subscribe(channel);
      if (!result.ok) {
        throw new Error(result.error?.message ?? `Failed to subscribe to ${channel}`);
      }
    }
  })().catch((caughtError) => {
    realtimeSetupPromise = null;
    throw caughtError;
  });

  return realtimeSetupPromise;
}

function toEpochSeconds(value: string | null | undefined) {
  if (!value) return Math.floor(Date.now() / 1000);
  return Math.floor(new Date(value).getTime() / 1000);
}

function toEpochMilliseconds(value: string | null | undefined) {
  if (!value) return Date.now();
  return new Date(value).getTime();
}

function normalizeEvidenceList(value: unknown): FinalOptionEvidence[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      id: String(record.id ?? ""),
      platform: String(record.platform ?? ""),
      title: String(record.title ?? ""),
      keywords: String(record.keywords ?? ""),
      summary: String(record.summary ?? ""),
      url: String(record.url ?? "")
    };
  }).filter((item) => item.url);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeCoverage(value: unknown): FinalOptionsCoverage {
  const record = (value && typeof value === "object") ? value as Record<string, unknown> : {};
  const completedPlatforms = normalizeStringList(record.completedPlatforms);
  const requiredPlatforms = ["youtube", "x", "reddit", "substack"] as const;
  const missingPlatforms = normalizeStringList(record.missingPlatforms).length > 0
    ? normalizeStringList(record.missingPlatforms)
    : requiredPlatforms.filter((platform) => !completedPlatforms.includes(platform));

  return {
    requiredPlatforms,
    completedPlatforms,
    missingPlatforms,
    readyForLovable: Boolean(record.readyForLovable) && missingPlatforms.length === 0
  };
}

function normalizeImplementationPlan(
  value: unknown,
  fallbackOption: FinalOption | undefined,
  fallbackEvidence: FinalOptionEvidence[]
): FinalImplementationPlan {
  const record = (value && typeof value === "object") ? value as Record<string, unknown> : {};

  const screens = Array.isArray(record.screens)
    ? record.screens.map((item) => {
      const screen = item as Record<string, unknown>;
      return {
        name: String(screen.name ?? ""),
        purpose: String(screen.purpose ?? ""),
        modules: normalizeStringList(screen.modules)
      };
    }).filter((screen) => screen.name || screen.purpose || screen.modules.length > 0)
    : [];

  const dataModel = Array.isArray(record.dataModel)
    ? record.dataModel.map((item) => {
      const entity = item as Record<string, unknown>;
      return {
        entity: String(entity.entity ?? ""),
        purpose: String(entity.purpose ?? ""),
        fields: normalizeStringList(entity.fields)
      };
    }).filter((entity) => entity.entity || entity.purpose || entity.fields.length > 0)
    : [];

  const workflows = Array.isArray(record.workflows)
    ? record.workflows.map((item) => {
      const workflow = item as Record<string, unknown>;
      return {
        name: String(workflow.name ?? ""),
        trigger: String(workflow.trigger ?? ""),
        outcome: String(workflow.outcome ?? "")
      };
    }).filter((workflow) => workflow.name || workflow.trigger || workflow.outcome)
    : [];

  return {
    generatedBy: "MiniMax-M2.7",
    title: String(record.title ?? fallbackOption?.title ?? ""),
    oneLiner: String(record.oneLiner ?? fallbackOption?.concept ?? ""),
    problem: String(record.problem ?? fallbackOption?.whyPromising ?? ""),
    targetUsers: String(record.targetUsers ?? fallbackOption?.audience ?? ""),
    valueProp: String(record.valueProp ?? fallbackOption?.marketAngle ?? ""),
    whyNow: String(record.whyNow ?? ""),
    coreUserFlows: normalizeStringList(record.coreUserFlows),
    screens,
    dataModel,
    workflows,
    integrations: normalizeStringList(record.integrations),
    monetization: String(record.monetization ?? ""),
    launchPlan: normalizeStringList(record.launchPlan),
    successMetrics: normalizeStringList(record.successMetrics),
    sourceEvidence: normalizeEvidenceList(record.sourceEvidence).length > 0
      ? normalizeEvidenceList(record.sourceEvidence)
      : fallbackEvidence
  };
}

function normalizeLovableHandoff(
  value: unknown,
  implementationPlan: FinalImplementationPlan,
  fallbackEvidence: FinalOptionEvidence[]
): LovableHandoff {
  const record = (value && typeof value === "object") ? value as Record<string, unknown> : {};
  const evidence = normalizeEvidenceList(record.evidence);

  return {
    title: String(record.title ?? implementationPlan.title),
    prompt: String(record.prompt ?? ""),
    launchUrl: String(record.launchUrl ?? ""),
    evidence: evidence.length > 0 ? evidence : fallbackEvidence
  };
}

function normalizeFinalOptions(value: unknown): FinalOptionsPayload | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return normalizeFinalOptions(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const options = Array.isArray(record.options) ? record.options as FinalOption[] : [];
  const fallbackOption = options[0];
  const primaryOptionId = String(record.primaryOptionId ?? fallbackOption?.id ?? "");
  const winningOption = options.find((option) => option.id === primaryOptionId) ?? fallbackOption;
  const fallbackEvidence = winningOption?.evidence ?? [];
  const coverage = normalizeCoverage(record.coverage);
  const implementationPlan = normalizeImplementationPlan(record.implementationPlan, winningOption, fallbackEvidence);
  const lovableHandoff = normalizeLovableHandoff(record.lovableHandoff, implementationPlan, fallbackEvidence);

  return {
    generatedAt: String(record.generatedAt ?? new Date().toISOString()),
    isFinal: Boolean(record.isFinal),
    marketResearch: {
      summary: String((record.marketResearch as Record<string, unknown> | undefined)?.summary ?? ""),
      signals: normalizeStringList((record.marketResearch as Record<string, unknown> | undefined)?.signals)
    },
    options,
    primaryOptionId,
    coverage,
    implementationPlan,
    lovableHandoff
  };
}

function normalizeMission(row: Record<string, unknown> | null | undefined): MissionRecord | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  return {
    id: String(row.id),
    prompt: String(row.prompt ?? ""),
    status: String(row.status ?? "queued") as MissionRecord["status"],
    liveUrl: (row.live_url_1 as string | null | undefined) ?? null,
    liveUrl2: (row.live_url_2 as string | null | undefined) ?? null,
    liveUrl3: (row.live_url_3 as string | null | undefined) ?? null,
    liveUrl4: (row.live_url_4 as string | null | undefined) ?? null,
    liveUrl5: (row.live_url_5 as string | null | undefined) ?? null,
    finalOptions: normalizeFinalOptions(row.final_options)
  };
}

function normalizeAgents(rows: unknown): AgentData[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      _id: String(record.id),
      agent_id: Number(record.agent_id ?? 0),
      status: String(record.status ?? "idle") as AgentData["status"],
      current_url: String(record.current_url ?? ""),
      profile_id: String(record.profile_path ?? ""),
      energy: Number(record.energy ?? 100)
    };
  });
}

function normalizeDiscoveries(rows: unknown): DiscoveredContent[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      _id: String(record.id),
      video_url: String(record.source_url ?? ""),
      thumbnail: String(record.thumbnail_url ?? ""),
      found_by_agent_id: Number(record.agent_id ?? 0),
      keywords: String(record.keywords ?? ""),
      likes: Number(record.likes ?? 0),
      views: Number(record.views ?? 0),
      comments: Number(record.comments ?? 0),
      _creationTime: toEpochSeconds(record.created_at as string | null | undefined)
    };
  });
}

function normalizeLogs(rows: unknown): LogEntry[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const metadata = record.metadata;

    return {
      _id: String(record.id),
      agent_id: Number(record.agent_id ?? 0),
      message: String(record.message ?? ""),
      type: String(record.type ?? "status") as LogEntry["type"],
      timestamp: toEpochSeconds(record.created_at as string | null | undefined),
      metadata: metadata ? JSON.stringify(metadata) : undefined
    };
  });
}

function normalizeSignals(rows: unknown): AgentSignal[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      _id: String(record.id),
      fromAgent: Number(record.from_agent ?? 0),
      toAgent: Number(record.to_agent ?? 0),
      message: String(record.message ?? ""),
      signalType: String(record.signal_type ?? "share"),
      timestamp: toEpochMilliseconds(record.created_at as string | null | undefined)
    };
  });
}

function normalizeThoughts(rows: unknown): AgentThought[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      _id: String(record.id),
      agent_id: record.agent_id != null ? Number(record.agent_id) : null,
      thought_type: String(record.thought_type ?? "inference") as AgentThought["thought_type"],
      prompt_summary: String(record.prompt_summary ?? ""),
      response_summary: String(record.response_summary ?? ""),
      action_taken: String(record.action_taken ?? ""),
      model: String(record.model ?? ""),
      tokens_used: Number(record.tokens_used ?? 0),
      duration_ms: Number(record.duration_ms ?? 0),
      timestamp: toEpochMilliseconds(record.created_at as string | null | undefined)
    };
  });
}

function normalizeMemory(rows: unknown): AgentMemoryEntry[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      _id: String(record.id),
      filename: String(record.filename ?? ""),
      content: String(record.content ?? ""),
      version: Number(record.version ?? 1),
      updated_by: record.updated_by != null ? String(record.updated_by) : null,
      timestamp: toEpochMilliseconds(record.updated_at as string | null | undefined)
    };
  });
}

function normalizeBusinessPlans(rows: unknown): BusinessPlan[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      _id: String(record.id),
      version: Number(record.version ?? 1),
      market_opportunity: String(record.market_opportunity ?? ""),
      competitive_landscape: String(record.competitive_landscape ?? ""),
      revenue_models: String(record.revenue_models ?? ""),
      user_acquisition: String(record.user_acquisition ?? ""),
      risk_analysis: String(record.risk_analysis ?? ""),
      confidence_score: Number(record.confidence_score ?? 0),
      discovery_count: Number(record.discovery_count ?? 0),
      is_final: Boolean(record.is_final),
      raw_plan: String(record.raw_plan ?? ""),
      timestamp: toEpochMilliseconds(record.created_at as string | null | undefined)
    };
  });
}

export function useMasterBuildDashboard() {
  const [latestMission, setLatestMission] = useState<MissionRecord | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [discoveries, setDiscoveries] = useState<DiscoveredContent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [signals, setSignals] = useState<AgentSignal[]>([]);
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  const [memory, setMemory] = useState<AgentMemoryEntry[]>([]);
  const [businessPlans, setBusinessPlans] = useState<BusinessPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingMission, setIsCreatingMission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadTokenRef = useRef(0);

  const configError = useMemo(() => getInsforgeConfigError(), []);

  const loadDashboard = useCallback(async () => {
    if (!hasInsforgeConfig) {
      setError(configError);
      setIsLoading(false);
      return;
    }

    const reloadToken = reloadTokenRef.current + 1;
    reloadTokenRef.current = reloadToken;

    try {
      const [
        missionResult, agentResult, discoveryResult, logResult, signalResult,
        thoughtsResult, memoryResult, businessPlanResult,
      ] = await Promise.all([
        insforge.database.from("missions").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        insforge.database.from("agents").select("*").order("agent_id", { ascending: true }),
        insforge.database.from("discoveries").select("*").order("created_at", { ascending: false }).limit(100),
        insforge.database.from("logs").select("*").order("created_at", { ascending: false }).limit(60),
        insforge.database.from("signals").select("*").order("created_at", { ascending: false }).limit(60),
        insforge.database.from("agent_thoughts").select("*").order("created_at", { ascending: false }).limit(100),
        insforge.database.from("agent_memory").select("*").order("filename", { ascending: true }),
        insforge.database.from("business_plans").select("*").order("created_at", { ascending: false }).limit(20),
      ]);

      const firstError =
        missionResult.error ??
        agentResult.error ??
        discoveryResult.error ??
        logResult.error ??
        signalResult.error;
      // Don't fail on new tables not yet created — they are additive
      // thoughtsResult.error, memoryResult.error, businessPlanResult.error are non-fatal

      if (firstError) {
        throw firstError;
      }

      if (reloadToken !== reloadTokenRef.current) {
        return;
      }

      startTransition(() => {
        setLatestMission(normalizeMission(missionResult.data as Record<string, unknown> | null));
        setAgents(normalizeAgents(agentResult.data));
        setDiscoveries(normalizeDiscoveries(discoveryResult.data));
        setLogs(normalizeLogs(logResult.data));
        setSignals(normalizeSignals(signalResult.data));
        if (!thoughtsResult.error) setThoughts(normalizeThoughts(thoughtsResult.data));
        if (!memoryResult.error) setMemory(normalizeMemory(memoryResult.data));
        if (!businessPlanResult.error) setBusinessPlans(normalizeBusinessPlans(businessPlanResult.data));
        setError(null);
        setIsLoading(false);
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Failed to load MasterBuild data from InsForge.";
      setError(message);
      setIsLoading(false);
    }
  }, [configError]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!hasInsforgeConfig) {
      return;
    }

    let isMounted = true;

    const refresh = () => {
      if (!isMounted) return;
      void loadDashboard();
    };

    const handleDisconnect = () => {
      if (!isMounted) return;
      setError("Realtime connection lost. Retrying against InsForge.");
      realtimeSetupPromise = null;
    };

    const handleConnectError = (caughtError: unknown) => {
      if (!isMounted) return;
      const message =
        caughtError instanceof Error ? caughtError.message : "Realtime connection failed.";
      setError(message);
      realtimeSetupPromise = null;
    };

    insforge.realtime.on("disconnect", handleDisconnect);
    insforge.realtime.on("connect_error", handleConnectError);
    for (const eventName of REALTIME_EVENTS) {
      insforge.realtime.on(eventName, refresh);
    }

    void ensureRealtimeReady().catch((caughtError) => {
      const message =
        caughtError instanceof Error ? caughtError.message : "Realtime connection failed.";
      setError(message);
    });

    return () => {
      isMounted = false;
      insforge.realtime.off("disconnect", handleDisconnect);
      insforge.realtime.off("connect_error", handleConnectError);
      for (const eventName of REALTIME_EVENTS) {
        insforge.realtime.off(eventName, refresh);
      }
    };
  }, [loadDashboard]);

  const createMission = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;
      setIsCreatingMission(true);

      try {
        const result = await insforge.database.rpc("start_masterbuild_mission", {
          mission_prompt: prompt.trim()
        });

        if (result.error) {
          throw result.error;
        }

        await loadDashboard();
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : "Failed to create mission.";
        setError(message);
      } finally {
        setIsCreatingMission(false);
      }
    },
    [loadDashboard]
  );

  const stopAll = useCallback(async () => {
    try {
      // Insert stop command for orchestrator to pick up
      await insforge.database.from("control_commands").insert([
        {
          mission_id: latestMission?.id ?? null,
          command: "stop_all",
          payload: { source: "ui" },
          status: "pending"
        }
      ]);

      // Also directly mark mission as stopping so UI updates immediately
      if (latestMission?.id) {
        await insforge.database.from("missions").update({ status: "stopping" }).eq("id", latestMission.id).catch(() => {});
      }

      // Mark all agents as stopped in DB
      await insforge.database.from("agents").update({ status: "stopped", energy: 0 }).neq("id", "00000000-0000-0000-0000-000000000000").catch(() => {});

      // Reload dashboard to reflect stopped state
      await loadDashboard();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Failed to queue stop command.";
      setError(message);
    }
  }, [latestMission?.id, loadDashboard]);

  const resetAll = useCallback(async () => {
    try {
      // 1. Send stop command to kill browser sessions
      if (latestMission?.id) {
        await insforge.database.from("control_commands").insert([
          { mission_id: latestMission.id, command: "stop_all", payload: { source: "reset" }, status: "pending" }
        ]).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // 2. Try the RPC first
      const rpcResult = await insforge.database.rpc("reset_masterbuild").catch(() => null);

      // 3. If RPC failed or doesn't exist, manually wipe tables
      if (!rpcResult || rpcResult.error) {
        const tables = ["logs", "discoveries", "signals", "control_commands", "builder_outputs", "agent_memory"];
        for (const table of tables) {
          await insforge.database.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").catch(() => {});
        }
        // Reset agents to idle
        await insforge.database.from("agents").update({
          status: "idle", current_url: "", assignment: "", energy: 100,
          preview_bucket: null, preview_key: null, preview_updated_at: null
        }).neq("id", "00000000-0000-0000-0000-000000000000").catch(() => {});
        // Mark missions stopped
        if (latestMission?.id) {
          await insforge.database.from("missions").update({ status: "stopped" }).eq("id", latestMission.id).catch(() => {});
        }
      }

      // 4. Clear frontend state immediately
      setLatestMission(null);
      setAgents([]);
      setDiscoveries([]);
      setLogs([]);
      setSignals([]);
      setThoughts([]);
      setMemory([]);
      setBusinessPlans([]);
      setError(null);

      // 5. Reload fresh state
      await loadDashboard();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to reset MasterBuild.";
      setError(message);
    }
  }, [latestMission?.id, loadDashboard]);

  return {
    latestMission,
    agents,
    discoveries,
    logs,
    signals,
    thoughts,
    memory,
    businessPlans,
    isLoading,
    isCreatingMission,
    error,
    createMission,
    stopAll,
    resetAll
  };
}
