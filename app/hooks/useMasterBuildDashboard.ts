"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getInsforgeConfigError, hasInsforgeConfig, insforge } from "../lib/insforge";
import type { AgentData, AgentSignal, DiscoveredContent, LogEntry } from "./useAgentData";

interface MissionRecord {
  id: string;
  prompt: string;
  status: "queued" | "active" | "stopping" | "stopped" | "completed" | "error";
  liveUrl: string | null;
  liveUrl2: string | null;
  liveUrl3: string | null;
  liveUrl4: string | null;
  liveUrl5: string | null;
  liveUrl6: string | null;
  liveUrl7: string | null;
  liveUrl8: string | null;
  liveUrl9: string | null;
}

const REALTIME_CHANNELS = ["missions", "agents", "discoveries", "logs", "signals"] as const;
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
    liveUrl6: (row.live_url_6 as string | null | undefined) ?? null,
    liveUrl7: (row.live_url_7 as string | null | undefined) ?? null,
    liveUrl8: (row.live_url_8 as string | null | undefined) ?? null,
    liveUrl9: (row.live_url_9 as string | null | undefined) ?? null
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

export function useMasterBuildDashboard() {
  const [latestMission, setLatestMission] = useState<MissionRecord | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [discoveries, setDiscoveries] = useState<DiscoveredContent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [signals, setSignals] = useState<AgentSignal[]>([]);
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
      const [missionResult, agentResult, discoveryResult, logResult, signalResult] = await Promise.all([
        insforge.database.from("missions").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        insforge.database.from("agents").select("*").order("agent_id", { ascending: true }),
        insforge.database.from("discoveries").select("*").order("created_at", { ascending: false }).limit(100),
        insforge.database.from("logs").select("*").order("created_at", { ascending: false }).limit(60),
        insforge.database.from("signals").select("*").order("created_at", { ascending: false }).limit(60)
      ]);

      const firstError =
        missionResult.error ??
        agentResult.error ??
        discoveryResult.error ??
        logResult.error ??
        signalResult.error;

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
      const result = await insforge.database.from("control_commands").insert([
        {
          mission_id: latestMission?.id ?? null,
          command: "stop_all",
          payload: { source: "ui" },
          status: "pending"
        }
      ]);

      if (result.error) {
        throw result.error;
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Failed to queue stop command.";
      setError(message);
    }
  }, [latestMission?.id]);

  const resetAll = useCallback(async () => {
    try {
      const result = await insforge.database.rpc("reset_masterbuild");
      if (result.error) {
        throw result.error;
      }
      await loadDashboard();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to reset MasterBuild.";
      setError(message);
    }
  }, [loadDashboard]);

  return {
    latestMission,
    agents,
    discoveries,
    logs,
    signals,
    isLoading,
    isCreatingMission,
    error,
    createMission,
    stopAll,
    resetAll
  };
}
