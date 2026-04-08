"use client";

/* eslint-disable @next/next/no-img-element */

import { Monitor, PanelsTopLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, type AgentData, type AgentSignal } from "../hooks/useAgentData";
import { useAgentPreview } from "../hooks/useAgentPreview";

const GLOW_KEYFRAMES_ID = "masterbuild-glow-keyframes";

function ensureGlowKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(GLOW_KEYFRAMES_ID)) return;

  const style = document.createElement("style");
  style.id = GLOW_KEYFRAMES_ID;
  style.textContent = `
    @keyframes mb-glow-pulse {
      0%, 100% {
        box-shadow:
          0 0 8px 1px var(--glow-color),
          0 0 24px 4px var(--glow-color),
          inset 0 0 12px 1px var(--glow-color-dim);
        border-color: var(--glow-color);
      }
      50% {
        box-shadow:
          0 0 16px 4px var(--glow-color),
          0 0 48px 12px var(--glow-color),
          inset 0 0 20px 2px var(--glow-color-dim);
        border-color: var(--glow-color-bright);
      }
    }
    @keyframes mb-scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100%); }
    }
    @keyframes mb-live-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `;
  document.head.appendChild(style);
}

interface SessionViewModel {
  id: string;
  agentId: number;
  name: string;
  color: string;
  baseRole: string;
  platform: string;
  status: string;
  currentUrl: string;
  isActive: boolean;
}

const CARD_GAP = 14;
const RIGHT_LOG_GUTTER = 410;

function isInteractiveStatus(status: string) {
  return !["idle", "stopped", "error"].includes(status);
}

function formatPlatform(platform: string) {
  switch (platform) {
    case "youtube":
      return "YouTube";
    case "x":
      return "X";
    case "reddit":
      return "Reddit";
    case "substack":
      return "Substack";
    case "market_research":
      return "Market Research";
    default:
      return platform;
  }
}

function getStatusTone(status: string, isActive: boolean) {
  if (status === "error") {
    return {
      badge: "rgba(248, 113, 113, 0.18)",
      border: "rgba(248, 113, 113, 0.36)",
      text: "#fda4af"
    };
  }

  if (isActive) {
    return {
      badge: "rgba(52, 211, 153, 0.16)",
      border: "rgba(52, 211, 153, 0.3)",
      text: "#86efac"
    };
  }

  return {
    badge: "rgba(71, 85, 105, 0.24)",
    border: "rgba(71, 85, 105, 0.32)",
    text: "#cbd5e1"
  };
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();

    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function SessionCard({
  session,
  onSelect,
  prefersReducedMotion
}: {
  session: SessionViewModel;
  onSelect: (agentId: number) => void;
  prefersReducedMotion: boolean;
}) {
  const { frameUrl, metadata, accessError } = useAgentPreview(session.agentId, {
    enabled: true
  });
  const status = metadata.status || session.status;
  const tone = getStatusTone(status, session.isActive);
  const isLive = isInteractiveStatus(status);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    ensureGlowKeyframes();
  }, []);

  // Smooth image transition
  useEffect(() => {
    if (imgRef.current) {
      imgRef.current.style.opacity = "0.6";
      const timer = setTimeout(() => {
        if (imgRef.current) imgRef.current.style.opacity = "1";
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [frameUrl]);

  const glowVars = isLive
    ? {
        "--glow-color": `${session.color}55`,
        "--glow-color-dim": `${session.color}18`,
        "--glow-color-bright": `${session.color}88`,
      } as React.CSSProperties
    : {};

  return (
    <button
      type="button"
      data-testid={`session-card-${session.agentId}`}
      onClick={() => onSelect(session.agentId)}
      style={{
        ...glowVars,
        width: "100%",
        minWidth: 0,
        height: "100%",
        padding: 0,
        borderRadius: 16,
        border: isLive ? `1.5px solid ${session.color}66` : `1px solid ${session.color}40`,
        background: "rgba(6, 11, 22, 0.92)",
        color: "#e2e8f0",
        display: "grid",
        gridTemplateRows: "1fr auto",
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: isLive
          ? `0 0 12px 2px ${session.color}33, 0 0 32px 6px ${session.color}18`
          : `0 12px 32px ${session.color}10`,
        animation: isLive && !prefersReducedMotion ? "mb-glow-pulse 2.4s ease-in-out infinite" : "none",
        transition: prefersReducedMotion
          ? "border-color 180ms ease, box-shadow 180ms ease"
          : "transform 280ms cubic-bezier(0.16, 1, 0.3, 1), border-color 280ms ease, box-shadow 280ms ease",
        willChange: "transform, box-shadow",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "#020408",
          borderBottom: "1px solid rgba(51, 65, 85, 0.4)",
          minHeight: 0
        }}
      >
        <img
          ref={imgRef}
          src={frameUrl}
          alt={`${session.name} preview`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transition: prefersReducedMotion ? "none" : "opacity 120ms ease-out",
          }}
        />

        {/* Scanline overlay when live */}
        {isLive && !prefersReducedMotion && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: "30%",
                background: `linear-gradient(180deg, transparent, ${session.color}08, transparent)`,
                animation: "mb-scanline 3s linear infinite",
              }}
            />
          </div>
        )}

        <div
          style={{
            position: "absolute",
            inset: "auto 10px 10px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 8px",
              borderRadius: 999,
              background: "rgba(2, 6, 14, 0.76)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              fontSize: 9,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#cbd5e1",
              backdropFilter: "blur(8px)"
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: session.isActive ? session.color : "#64748b",
                boxShadow: session.isActive ? `0 0 12px ${session.color}` : "none"
              }}
            />
            {formatPlatform(session.platform)}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* LIVE indicator */}
            {isLive && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 8px",
                  borderRadius: 999,
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: "#fca5a5",
                  backdropFilter: "blur(8px)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "#ef4444",
                    animation: "mb-live-dot 1.2s ease-in-out infinite",
                    boxShadow: "0 0 8px rgba(239, 68, 68, 0.6)",
                  }}
                />
                LIVE
              </div>
            )}

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 8px",
                borderRadius: 999,
                background: tone.badge,
                border: `1px solid ${tone.border}`,
                fontSize: 9,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                color: tone.text,
                backdropFilter: "blur(8px)"
              }}
            >
              {status}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "8px 12px 10px", display: "grid", gap: 3, textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>{session.name}</div>
          <div style={{ fontSize: 9, letterSpacing: 1.3, textTransform: "uppercase", color: session.color }}>
            {session.baseRole}
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            color: "#64748b",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
          title={metadata.currentUrl || metadata.note || session.currentUrl}
        >
          {metadata.currentUrl || metadata.note || session.currentUrl || "Waiting for live session"}
        </div>

        <div style={{ fontSize: 9, color: accessError ? "#fda4af" : "#475569" }}>
          {accessError
            ? accessError
            : metadata.updatedAt
              ? `Updated ${new Date(metadata.updatedAt).toLocaleTimeString()}`
              : "Awaiting first relay frame"}
        </div>
      </div>
    </button>
  );
}

function FocusedSession({
  session,
  onBack,
  prefersReducedMotion
}: {
  session: SessionViewModel;
  onBack: () => void;
  prefersReducedMotion: boolean;
}) {
  const { frameUrl, metadata, accessError } = useAgentPreview(session.agentId);
  const status = metadata.status || session.status;
  const tone = getStatusTone(status, session.isActive);
  const isLive = isInteractiveStatus(status);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    ensureGlowKeyframes();
  }, []);

  useEffect(() => {
    if (imgRef.current) {
      imgRef.current.style.opacity = "0.7";
      const timer = setTimeout(() => {
        if (imgRef.current) imgRef.current.style.opacity = "1";
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [frameUrl]);

  const glowVars = isLive
    ? ({
        "--glow-color": `${session.color}55`,
        "--glow-color-dim": `${session.color}18`,
        "--glow-color-bright": `${session.color}88`,
      } as React.CSSProperties)
    : {};

  return (
    <div
      data-testid="session-focus"
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 16
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: session.color }}>
              Focused Browser Session
            </div>
            {isLive && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: "#fca5a5",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "#ef4444",
                    animation: "mb-live-dot 1.2s ease-in-out infinite",
                    boxShadow: "0 0 8px rgba(239, 68, 68, 0.6)",
                  }}
                />
                LIVE
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc" }}>{session.name}</div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 11px",
                borderRadius: 999,
                background: tone.badge,
                border: `1px solid ${tone.border}`,
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: tone.text
              }}
            >
              {status}
            </div>
          </div>
        </div>

        <button
          type="button"
          data-testid="session-back"
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 16px",
            borderRadius: 14,
            border: "1px solid rgba(100, 116, 139, 0.28)",
            background: "rgba(8, 15, 28, 0.86)",
            color: "#e2e8f0",
            cursor: "pointer"
          }}
        >
          <PanelsTopLeft size={16} />
          Back to sessions
        </button>
      </div>

      <div
        style={{
          ...glowVars,
          minHeight: 0,
          borderRadius: 26,
          overflow: "hidden",
          position: "relative",
          background: "rgba(4, 10, 19, 0.92)",
          border: isLive ? `2px solid ${session.color}66` : `1px solid ${session.color}33`,
          boxShadow: isLive
            ? `0 0 20px 4px ${session.color}33, 0 0 60px 12px ${session.color}18`
            : `0 24px 80px ${session.color}16`,
          animation: isLive && !prefersReducedMotion ? "mb-glow-pulse 2.4s ease-in-out infinite" : "none",
          transform: "translateZ(0)",
        }}
      >
        <img
          ref={imgRef}
          src={frameUrl}
          alt={`${session.name} focused preview`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            transition: prefersReducedMotion ? "none" : "opacity 150ms ease-out",
          }}
        />

        {isLive && !prefersReducedMotion && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: "20%",
                background: `linear-gradient(180deg, transparent, ${session.color}06, transparent)`,
                animation: "mb-scanline 4s linear infinite",
              }}
            />
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          padding: "18px 20px",
          borderRadius: 20,
          background: "rgba(5, 10, 18, 0.9)",
          border: "1px solid rgba(51, 65, 85, 0.4)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#f8fafc" }}>{metadata.title || `${session.baseRole} session`}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{formatPlatform(session.platform)}</div>
        </div>
        <div style={{ fontSize: 12, color: "#64748b", wordBreak: "break-all" }}>
          {metadata.currentUrl || metadata.note || session.currentUrl || "Waiting for local browser session"}
        </div>
        <div style={{ fontSize: 11, color: accessError ? "#fda4af" : "#475569" }}>
          {accessError
            ? accessError
            : metadata.updatedAt
              ? `Relay updated ${new Date(metadata.updatedAt).toLocaleTimeString()}`
              : "Awaiting first relay frame"}
        </div>
      </div>
    </div>
  );
}

export function CommandCenterScene({
  agents,
  liveUrls
}: {
  agents: AgentData[];
  signals: AgentSignal[];
  liveUrls: Record<number, string | null>;
  isRunning: boolean;
}) {
  const [focusedAgentId, setFocusedAgentId] = useState<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const agentMap = useMemo(() => {
    const map = new Map<number, AgentData>();
    for (const agent of agents) {
      map.set(agent.agent_id, agent);
    }
    return map;
  }, [agents]);

  const sessions = useMemo(() => {
    return AGENTS
      .filter((agent) => agent.agentId !== 5)
      .map((agent) => {
        const runtimeAgent = agentMap.get(agent.agentId);
        const currentUrl = runtimeAgent?.current_url ?? "";
        const status = runtimeAgent?.status ?? "idle";
        const isActive =
          Boolean(liveUrls[agent.agentId] ?? `/agent-stream/${agent.agentId}`) &&
          (Boolean(currentUrl) || isInteractiveStatus(status));

        return {
          id: agent.id,
          agentId: agent.agentId,
          name: agent.name,
          color: agent.color,
          baseRole: agent.baseRole,
          platform: agent.platform,
          status,
          currentUrl,
          isActive
        } satisfies SessionViewModel;
      });
  }, [agentMap, liveUrls]);

  const focusedSession = focusedAgentId
    ? sessions.find((session) => session.agentId === focusedAgentId) ?? null
    : null;

  return (
    <div
      data-testid="session-workspace"
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, #06101b 0%, #020408 42%, #010204 100%)"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: `96px ${RIGHT_LOG_GUTTER}px 164px 24px`,
          display: "grid",
          gridTemplateRows: "auto 1fr",
          gap: 14,
          minWidth: 0
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: 2.6, textTransform: "uppercase", color: "#22d3ee" }}>
            Browser Sessions
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc" }}>
            {focusedSession ? focusedSession.name : "4 Active Agents"}
          </div>
        </div>

        {focusedSession ? (
          <FocusedSession
            session={focusedSession}
            onBack={() => setFocusedAgentId(null)}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : (
          <div
            data-testid="session-strip"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: "1fr 1fr",
              gap: CARD_GAP,
              minHeight: 0
            }}
          >
            {sessions.map((session) => (
              <SessionCard
                key={session.agentId}
                session={session}
                onSelect={setFocusedAgentId}
                prefersReducedMotion={prefersReducedMotion}
              />
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: 24,
          bottom: 112,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 14,
          background: "rgba(4, 10, 19, 0.78)",
          border: "1px solid rgba(71, 85, 105, 0.2)",
          color: "#94a3b8",
          fontSize: 11,
          pointerEvents: "none"
        }}
      >
        <Monitor size={14} />
        Local browser relay only.
      </div>
    </div>
  );
}
