"use client";

import { Activity, Radio, RotateCcw, Search, StopCircle, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAgentById, getLogIcon, type LogEntry } from "../hooks/useAgentData";

interface CommandOverlayProps {
  isRunning: boolean;
  isDeploying: boolean;
  missionPrompt: string;
  logs: LogEntry[];
  activeAgentCount: number;
  isLoading: boolean;
  error: string | null;
  onCreateMission: (prompt: string) => void;
  onStopAll: () => void;
  onResetAll: () => void;
}

export function CommandOverlay({
  isRunning,
  isDeploying,
  missionPrompt,
  logs,
  activeAgentCount,
  isLoading,
  error,
  onCreateMission,
  onStopAll,
  onResetAll
}: CommandOverlayProps) {
  const [query, setQuery] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: "0 0 auto 0",
          padding: "18px 22px",
          zIndex: 40,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(180deg, rgba(2,4,8,0.92) 0%, rgba(2,4,8,0) 100%)",
          fontFamily: "'JetBrains Mono', monospace"
        }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#22d3ee" }}>
            MasterBuild
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
            Local Browser Use command center
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: isRunning ? "#34d399" : "#64748b" }}>
            <Activity size={13} />
            <span>{activeAgentCount} ACTIVE</span>
          </div>
          <button
            onClick={onResetAll}
            style={{
              border: "1px solid rgba(248, 113, 113, 0.4)",
              background: "transparent",
              color: "#f87171",
              padding: "8px 12px",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer"
            }}
          >
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
      </div>

      {logs.length > 0 ? (
        <div
          ref={logRef}
          style={{
            position: "fixed",
            top: 78,
            right: 18,
            width: 340,
            maxHeight: "calc(100vh - 180px)",
            overflowY: "auto",
            zIndex: 35,
            padding: 14,
            borderRadius: 18,
            border: "1px solid rgba(71, 85, 105, 0.25)",
            background: "rgba(4, 10, 19, 0.84)",
            backdropFilter: "blur(14px)",
            fontFamily: "'JetBrains Mono', monospace"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#94a3b8" }}>
            <Radio size={12} />
            Mission Logs
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {logs.slice(0, 35).map((log) => {
              const agent = getAgentById(log.agent_id);
              return (
                <div key={log._id} style={{ paddingBottom: 10, borderBottom: "1px solid rgba(30, 41, 59, 0.8)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: agent.color }}>{agent.name}</span>
                    <span style={{ fontSize: 9, color: "#64748b" }}>{new Date(log.timestamp * 1000).toLocaleTimeString()}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>
                    <span>{getLogIcon(log.type)}</span>
                    <span>{log.message}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "18px 22px 24px",
          zIndex: 40,
          background: "linear-gradient(0deg, rgba(2,4,8,0.95) 0%, rgba(2,4,8,0) 100%)",
          fontFamily: "'JetBrains Mono', monospace"
        }}
      >
        <div style={{ margin: "0 auto", width: "min(920px, 100%)", display: "grid", gap: 12 }}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (query.trim()) {
                onCreateMission(query.trim());
                setQuery("");
              }
            }}
            style={{ display: "flex", gap: 10 }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderRadius: 16,
                padding: "14px 16px",
                background: "rgba(8, 17, 31, 0.92)",
                border: "1px solid rgba(71, 85, 105, 0.3)"
              }}
            >
              <Search size={15} style={{ color: "#64748b" }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Create a mission. Example: Find viral AI meeting-note TikToks and top competitor examples."
                style={{ flex: 1, background: "transparent", border: 0, outline: 0, color: "#e2e8f0" }}
              />
            </div>

            <button
              type="submit"
              disabled={!query.trim() || isDeploying}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 18px",
                borderRadius: 16,
                border: "1px solid rgba(34, 211, 238, 0.4)",
                background: !query.trim() || isDeploying ? "#0f172a" : "linear-gradient(135deg, #22d3ee 0%, #0ea5e9 100%)",
                color: !query.trim() || isDeploying ? "#64748b" : "#03111d",
                fontWeight: 700,
                cursor: !query.trim() || isDeploying ? "default" : "pointer"
              }}
            >
              <Zap size={14} />
              {isDeploying ? "Launching..." : isRunning ? "New Mission" : "Launch Mission"}
            </button>

            {isRunning ? (
              <button
                type="button"
                onClick={onStopAll}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 18px",
                  borderRadius: 16,
                  border: "1px solid rgba(248, 113, 113, 0.4)",
                  background: "transparent",
                  color: "#f87171",
                  cursor: "pointer"
                }}
              >
                <StopCircle size={14} />
                Stop All
              </button>
            ) : null}
          </form>

          <div style={{ fontSize: 11, color: "#64748b" }}>
            {error
              ? error
              : isLoading
                ? "Connecting to InsForge runtime..."
                : missionPrompt
                  ? `Current mission: ${missionPrompt}`
                  : "No mission running. Launch a brief with competitor or niche language."}
          </div>
        </div>
      </div>
    </>
  );
}
