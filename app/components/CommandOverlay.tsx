"use client";

import { Activity, Lightbulb, Radio, RotateCcw, Search, StopCircle, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAgentById, getLogIcon, type LogEntry } from "../hooks/useAgentData";
import type { FinalOptionsPayload } from "../hooks/useMasterBuildDashboard";

interface CommandOverlayProps {
  userEmail: string;
  isRunning: boolean;
  isDeploying: boolean;
  missionPrompt: string;
  finalOptions: FinalOptionsPayload | null;
  logs: LogEntry[];
  activeAgentCount: number;
  isLoading: boolean;
  error: string | null;
  onCreateMission: (prompt: string) => void;
  onStopAll: () => void;
  onResetAll: () => void;
  onSignOut: () => void;
}

export function CommandOverlay({
  userEmail,
  isRunning,
  isDeploying,
  missionPrompt,
  finalOptions,
  logs,
  activeAgentCount,
  isLoading,
  error,
  onCreateMission,
  onStopAll,
  onResetAll,
  onSignOut
}: CommandOverlayProps) {
  const [query, setQuery] = useState("");
  const [showFinalOptions, setShowFinalOptions] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (finalOptions) setShowFinalOptions(true);
  }, [finalOptions]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <>
      {showFinalOptions && finalOptions ? (
        <div
          data-testid="final-options-modal"
          style={{
            position: "fixed",
            top: 78,
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(760px, calc(100vw - 400px))",
            maxHeight: "calc(100vh - 200px)",
            overflowY: "auto",
            zIndex: 50,
            padding: "20px 24px",
            borderRadius: 18,
            border: "1px solid rgba(168, 85, 247, 0.35)",
            background: "rgba(4, 10, 19, 0.94)",
            backdropFilter: "blur(20px)",
            fontFamily: "'JetBrains Mono', monospace",
            boxShadow: "0 0 60px rgba(168, 85, 247, 0.15)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#a855f7" }}>
              <Lightbulb size={14} />
              {finalOptions.isFinal ? "Final Options" : "Market Research Snapshot"}
            </div>
            <button
              onClick={() => setShowFinalOptions(false)}
              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, padding: "0 4px" }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "#94a3b8" }}>
                Market Research Summary
              </div>
              <div style={{ fontSize: 12.5, color: "#e2e8f0", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {finalOptions.marketResearch.summary}
              </div>
              {finalOptions.marketResearch.signals.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {finalOptions.marketResearch.signals.map((signal) => (
                    <div
                      key={signal}
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(148, 163, 184, 0.2)",
                        background: "rgba(15, 23, 42, 0.72)",
                        color: "#cbd5e1",
                        padding: "6px 10px",
                        fontSize: 10,
                        letterSpacing: 1.1,
                        textTransform: "uppercase"
                      }}
                    >
                      {signal}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {finalOptions.options.map((option) => (
                <div
                  key={option.id}
                  data-testid={`final-option-${option.id}`}
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid rgba(124, 58, 237, 0.22)",
                    background: "rgba(9, 14, 28, 0.82)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>{option.title}</div>
                    <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#a855f7" }}>
                      {option.recommendedFormat}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#e2e8f0" }}>{option.concept}</div>
                  <div style={{ display: "grid", gap: 6, fontSize: 11.5, color: "#cbd5e1" }}>
                    <div><span style={{ color: "#94a3b8" }}>Audience:</span> {option.audience}</div>
                    <div><span style={{ color: "#94a3b8" }}>Why promising:</span> {option.whyPromising}</div>
                    <div><span style={{ color: "#94a3b8" }}>Market angle:</span> {option.marketAngle}</div>
                  </div>
                  {option.evidence.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#94a3b8" }}>
                        Evidence Links
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {option.evidence.map((evidence) => (
                          <a
                            key={`${option.id}-${evidence.id}-${evidence.url}`}
                            href={evidence.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "grid",
                              gap: 4,
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid rgba(71, 85, 105, 0.28)",
                              background: "rgba(2, 6, 14, 0.72)",
                              color: "#bfdbfe",
                              textDecoration: "none"
                            }}
                          >
                            <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "#94a3b8" }}>
                              {evidence.platform}
                            </div>
                            <div style={{ fontSize: 11.5, color: "#e2e8f0" }}>
                              {evidence.title || evidence.keywords || evidence.url}
                            </div>
                            <div style={{ fontSize: 10.5, color: "#94a3b8", lineHeight: 1.5 }}>
                              {evidence.summary || evidence.keywords}
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

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
          <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
            <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#475569" }}>Operator</div>
            <div style={{ fontSize: 11, color: "#cbd5e1" }}>{userEmail}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: isRunning ? "#34d399" : "#64748b" }}>
            <Activity size={13} />
            <span>{activeAgentCount} ACTIVE</span>
          </div>
          <button
            onClick={onSignOut}
            style={{
              border: "1px solid rgba(71, 85, 105, 0.34)",
              background: "transparent",
              color: "#cbd5e1",
              padding: "8px 12px",
              borderRadius: 10,
              cursor: "pointer"
            }}
          >
            Sign Out
          </button>
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
                placeholder="Create a mission. Example: Find whitespace in AI meeting-note content across YouTube, X, Reddit, and Substack."
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
