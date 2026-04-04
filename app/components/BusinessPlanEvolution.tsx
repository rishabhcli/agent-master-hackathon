"use client";

import {
  BarChart3,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENTS,
  PLATFORM_COLORS,
  type AgentData,
  type BusinessPlan,
  type DiscoveredContent,
} from "../hooks/useAgentData";
import type { FinalOptionsPayload } from "../hooks/useMasterBuildDashboard";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  plans: BusinessPlan[];
  agents: AgentData[];
  discoveries: DiscoveredContent[];
  missionPrompt: string;
  finalOptions: FinalOptionsPayload | null;
  isRunning: boolean;
  onStopAll: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CYAN = "#22d3ee";
const PURPLE = "#8b5cf6";

function confidenceColor(score: number) {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#eab308";
  return "#ef4444";
}

function agentStatusIndicator(status: AgentData["status"]) {
  switch (status) {
    case "searching":
    case "found_trend":
    case "exploiting":
    case "reassigning":
      return { color: "#22c55e", label: "active" };
    case "weak":
      return { color: "#eab308", label: "weak" };
    case "error":
      return { color: "#ef4444", label: "error" };
    case "stopped":
      return { color: "#64748b", label: "stopped" };
    case "idle":
    default:
      return { color: "#475569", label: "idle" };
  }
}

/* ------------------------------------------------------------------ */
/*  Markdown-like renderer                                             */
/* ------------------------------------------------------------------ */

function renderMarkdownLike(text: string): React.ReactNode[] {
  if (!text) return [];
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const key = `md-${i}`;

    // Empty line → spacer
    if (line.trim() === "") {
      nodes.push(<div key={key} style={{ height: 6 }} />);
      continue;
    }

    // # Heading
    if (line.startsWith("# ")) {
      nodes.push(
        <div
          key={key}
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "rgba(255,255,255,0.95)",
            marginTop: 10,
            marginBottom: 4,
          }}
        >
          {line.slice(2)}
        </div>
      );
      continue;
    }

    // ## Subheading
    if (line.startsWith("## ")) {
      nodes.push(
        <div
          key={key}
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: CYAN,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginTop: 8,
            marginBottom: 3,
          }}
        >
          {line.slice(3)}
        </div>
      );
      continue;
    }

    // ### Subsubheading (treat like ## but slightly different)
    if (line.startsWith("### ")) {
      nodes.push(
        <div
          key={key}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.7)",
            marginTop: 6,
            marginBottom: 2,
          }}
        >
          {line.slice(4)}
        </div>
      );
      continue;
    }

    // - Bullet item
    if (line.trimStart().startsWith("- ")) {
      const indent = line.length - line.trimStart().length;
      nodes.push(
        <div
          key={key}
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.75)",
            lineHeight: 1.5,
            paddingLeft: 12 + indent * 4,
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: indent * 4,
              color: "rgba(255,255,255,0.3)",
            }}
          >
            -
          </span>
          {renderInlineFormatting(line.trimStart().slice(2))}
        </div>
      );
      continue;
    }

    // Regular text (may contain **bold**)
    nodes.push(
      <div
        key={key}
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.75)",
          lineHeight: 1.5,
        }}
      >
        {renderInlineFormatting(line)}
      </div>
    );
  }

  return nodes;
}

/** Handle **Bold:** patterns inline */
function renderInlineFormatting(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
        {match[1]}
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Connector({ active }: { active: boolean }) {
  return (
    <div
      style={{
        width: 2,
        height: 16,
        margin: "0 auto",
        borderRadius: 1,
        background: active
          ? `linear-gradient(180deg, ${CYAN}, ${PURPLE})`
          : "rgba(255,255,255,0.1)",
      }}
    />
  );
}

const PLAN_SECTIONS: {
  key: keyof Pick<
    BusinessPlan,
    | "market_opportunity"
    | "competitive_landscape"
    | "revenue_models"
    | "user_acquisition"
    | "risk_analysis"
  >;
  label: string;
  icon: string;
}[] = [
  { key: "market_opportunity", label: "Market", icon: "M" },
  { key: "competitive_landscape", label: "Competition", icon: "C" },
  { key: "revenue_models", label: "Revenue", icon: "R" },
  { key: "user_acquisition", label: "Growth", icon: "G" },
  { key: "risk_analysis", label: "Risks", icon: "!" },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function BusinessPlanEvolution({
  plans,
  agents,
  discoveries,
  missionPrompt,
  finalOptions,
  isRunning,
  onStopAll,
}: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const latest = plans[0] ?? null;
  const history = plans.slice(1);

  // Agent discovery counts
  const agentDiscoveryCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const d of discoveries) {
      counts[d.found_by_agent_id] = (counts[d.found_by_agent_id] ?? 0) + 1;
    }
    return counts;
  }, [discoveries]);

  // Rendered report text
  const reportNodes = useMemo(() => {
    if (!latest?.raw_plan) return null;
    return renderMarkdownLike(latest.raw_plan);
  }, [latest?.raw_plan]);

  // Auto-scroll report on update
  useEffect(() => {
    if (reportRef.current) {
      reportRef.current.scrollTop = reportRef.current.scrollHeight;
    }
  }, [latest?.raw_plan]);

  const handleCopy = useCallback(() => {
    if (!latest?.raw_plan) return;
    navigator.clipboard.writeText(latest.raw_plan).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [latest?.raw_plan]);

  const lovableReady =
    finalOptions?.coverage?.readyForLovable && finalOptions?.lovableHandoff?.launchUrl;
  const lovableUrl = finalOptions?.lovableHandoff?.launchUrl ?? "";

  // ---- No mission state ----
  if (!missionPrompt) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "rgba(255,255,255,0.3)",
          fontSize: 12,
          textAlign: "center",
          padding: 24,
          gap: 12,
        }}
      >
        <BarChart3 size={28} style={{ opacity: 0.3 }} />
        <span>Launch a mission to generate a business report</span>
      </div>
    );
  }

  // ---- Running but no plans yet ----
  if (plans.length === 0 && isRunning) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "rgba(255,255,255,0.45)",
          fontSize: 12,
          textAlign: "center",
          padding: 24,
          gap: 12,
        }}
      >
        <Loader2
          size={22}
          className="animate-spin"
          style={{ color: CYAN }}
        />
        <span>Synthesizing report from agent discoveries...</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
          {discoveries.length} discoveries collected so far
        </span>
      </div>
    );
  }

  // ---- Stopped / completed with no plans ----
  if (plans.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "rgba(255,255,255,0.3)",
          fontSize: 12,
          textAlign: "center",
          padding: 24,
          gap: 12,
        }}
      >
        <BarChart3 size={28} style={{ opacity: 0.3 }} />
        <span>No business plan synthesized yet</span>
      </div>
    );
  }

  /* ================================================================ */
  /*  Full UI                                                          */
  /* ================================================================ */

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* ============================================================ */}
      {/*  TOP PANEL — Strategy Pipeline Flowchart (~45%)               */}
      {/* ============================================================ */}
      <div
        style={{
          flex: "0 0 45%",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "12px 8px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* ---- Mission Idea Node ---- */}
        <div
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 3,
            }}
          >
            Mission
          </div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.4,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {missionPrompt}
          </div>
        </div>

        <Connector active={isRunning || plans.length > 0} />

        {/* ---- Research Agent Row ---- */}
        <div
          style={{
            width: "100%",
            display: "flex",
            gap: 4,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {AGENTS.map((agentDef) => {
            const agentData = agents.find(
              (a) => a.agent_id === agentDef.agentId
            );
            const status = agentData
              ? agentStatusIndicator(agentData.status)
              : agentStatusIndicator("idle");
            const discCount = agentDiscoveryCounts[agentDef.agentId] ?? 0;

            return (
              <div
                key={agentDef.id}
                style={{
                  flex: "1 1 0",
                  minWidth: 52,
                  maxWidth: 72,
                  padding: "6px 4px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${status.color}33`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                {/* Status dot */}
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: status.color,
                    boxShadow:
                      status.label === "active"
                        ? `0 0 6px ${status.color}`
                        : "none",
                  }}
                  className={
                    status.label === "active" ? "animate-pulse-glow" : undefined
                  }
                />
                {/* Agent name */}
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: PLATFORM_COLORS[agentDef.platform] ?? agentDef.color,
                  }}
                >
                  {agentDef.name}
                </div>
                {/* Platform */}
                <div
                  style={{
                    fontSize: 7,
                    color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {agentDef.platform === "market_research"
                    ? "MKT"
                    : agentDef.platform}
                </div>
                {/* Discovery count */}
                {discCount > 0 && (
                  <div
                    style={{
                      fontSize: 8,
                      color: "rgba(255,255,255,0.5)",
                      background: "rgba(255,255,255,0.05)",
                      padding: "1px 4px",
                      borderRadius: 4,
                    }}
                  >
                    {discCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Connector active={plans.length > 0} />

        {/* ---- Synthesis Status Node ---- */}
        {latest && (
          <div
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: 8,
              background: latest.is_final
                ? "rgba(34,197,94,0.06)"
                : "rgba(139,92,246,0.06)",
              border: `1px solid ${
                latest.is_final
                  ? "rgba(34,197,94,0.2)"
                  : "rgba(139,92,246,0.2)"
              }`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {latest.is_final ? (
                  <CheckCircle2
                    size={12}
                    style={{ color: "#22c55e" }}
                  />
                ) : (
                  <TrendingUp size={12} style={{ color: PURPLE }} />
                )}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {latest.is_final ? "Final" : `v${latest.version}`}
                </span>
              </div>
              <span
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                {latest.discovery_count} disc
              </span>
            </div>
            {/* Confidence bar */}
            <div
              style={{
                width: "100%",
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, latest.confidence_score)}%`,
                  height: "100%",
                  borderRadius: 2,
                  background: confidenceColor(latest.confidence_score),
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 9,
                color: confidenceColor(latest.confidence_score),
                textAlign: "right",
                marginTop: 2,
              }}
            >
              {latest.confidence_score}%
            </div>
          </div>
        )}

        <Connector active={plans.length > 0} />

        {/* ---- Plan Section Cards (2-column grid) ---- */}
        {latest && (
          <div
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
            }}
          >
            {PLAN_SECTIONS.map((section) => {
              const content = latest[section.key] ?? "";
              const filled =
                content.length > 0 &&
                !content.startsWith("Pending");

              return (
                <div
                  key={section.key}
                  style={{
                    padding: "8px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${
                      filled
                        ? "rgba(34,211,238,0.15)"
                        : "rgba(255,255,255,0.05)"
                    }`,
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      marginBottom: 3,
                    }}
                  >
                    {filled ? (
                      <CheckCircle2
                        size={10}
                        style={{ color: CYAN, flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          border: "1px solid rgba(255,255,255,0.15)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: filled
                          ? "rgba(255,255,255,0.7)"
                          : "rgba(255,255,255,0.35)",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      {section.label}
                    </span>
                  </div>
                  {filled && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.55)",
                        lineHeight: 1.35,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/*  BOTTOM PANEL — Live Report (~55%)                            */}
      {/* ============================================================ */}
      <div
        style={{
          flex: "1 1 55%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* Report header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 10px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart3 size={12} style={{ color: PURPLE }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              Live Report
            </span>
            {latest && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: latest.is_final
                    ? "rgba(34,197,94,0.15)"
                    : "rgba(139,92,246,0.15)",
                  color: latest.is_final ? "#86efac" : "#c4b5fd",
                }}
              >
                v{latest.version}
              </span>
            )}
          </div>
          {latest?.raw_plan && (
            <button
              onClick={handleCopy}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 4,
                border: "1px solid rgba(255,255,255,0.1)",
                background: copied
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(255,255,255,0.03)",
                color: copied
                  ? "#86efac"
                  : "rgba(255,255,255,0.45)",
                fontSize: 9,
                cursor: "pointer",
              }}
            >
              <Copy size={10} />
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>

        {/* Report body */}
        <div
          ref={reportRef}
          style={{
            flex: 1,
            overflow: "auto",
            padding: "8px 10px",
            minHeight: 0,
          }}
        >
          {reportNodes && reportNodes.length > 0 ? (
            reportNodes
          ) : (
            <div
              style={{
                color: "rgba(255,255,255,0.25)",
                fontSize: 11,
                textAlign: "center",
                paddingTop: 20,
              }}
            >
              {isRunning
                ? "Report will appear as agents gather data..."
                : "No raw report data available."}
            </div>
          )}
        </div>

        {/* Version history badges */}
        {history.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 8,
                color: "rgba(255,255,255,0.25)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginRight: 2,
              }}
            >
              History
            </span>
            {history.map((plan) => (
              <span
                key={plan._id}
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.35)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                v{plan.version}{" "}
                <span style={{ color: confidenceColor(plan.confidence_score) }}>
                  {plan.confidence_score}%
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div
          style={{
            padding: "6px 10px 10px",
            flexShrink: 0,
            display: "flex",
            gap: 6,
          }}
        >
          {/* "Build in Lovable" — shown when ready and not running */}
          {lovableReady && !isRunning && (
            <a
              href={lovableUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "7px 0",
                borderRadius: 6,
                border: "none",
                background: `linear-gradient(135deg, ${CYAN}22, ${PURPLE}22)`,
                color: CYAN,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <ExternalLink size={12} />
              Build in Lovable
            </a>
          )}

          {/* "Stop & Build in Lovable" — shown when running */}
          {isRunning && (
            <button
              onClick={() => {
                onStopAll();
                if (lovableUrl) {
                  window.open(lovableUrl, "_blank", "noopener,noreferrer");
                }
              }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "7px 0",
                borderRadius: 6,
                border: `1px solid ${PURPLE}44`,
                background: `rgba(139,92,246,0.08)`,
                color: "#c4b5fd",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <ExternalLink size={12} />
              Stop &amp; Build in Lovable
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
