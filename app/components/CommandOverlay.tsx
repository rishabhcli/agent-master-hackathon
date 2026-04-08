"use client";

import { Activity, Eye, Lightbulb, Monitor, Radio, RotateCcw, Search, StopCircle, Zap } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
  viewMode: "command" | "observe";
  onViewModeChange: (mode: "command" | "observe") => void;
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
  viewMode,
  onViewModeChange,
  onCreateMission,
  onStopAll,
  onResetAll,
  onSignOut
}: CommandOverlayProps) {
  const [query, setQuery] = useState("");
  const [showFinalOptions, setShowFinalOptions] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const logRef = useRef<HTMLDivElement>(null);
  const finalOptionsRef = useRef<HTMLDivElement>(null);
  const closeFinalOptionsButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const finalOptionsTitleId = useId();
  const finalOptionsDescriptionId = useId();

  useEffect(() => {
    if (finalOptions) setShowFinalOptions(true);
  }, [finalOptions]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [logs]);

  useEffect(() => {
    if (!(showFinalOptions && finalOptions)) {
      return;
    }

    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frameId = window.requestAnimationFrame(() => {
      closeFinalOptionsButtonRef.current?.focus();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousOverflow;
      previousFocusedElementRef.current?.focus();
    };
  }, [finalOptions, showFinalOptions]);

  useEffect(() => {
    if (!(showFinalOptions && finalOptions)) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowFinalOptions(false);
        return;
      }

      if (event.key !== "Tab" || !finalOptionsRef.current) {
        return;
      }

      const focusableElements = Array.from(
        finalOptionsRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusableElements.length === 0) {
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [finalOptions, showFinalOptions]);

  const handleReset = async () => {
    // First send stop command to kill browser sessions, then reset DB
    if (isRunning) {
      onStopAll();
      // Brief delay to let stop propagate before wiping DB
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    onResetAll();
  };

  const handleCopyLovablePrompt = async () => {
    try {
      const prompt = finalOptions?.lovableHandoff?.prompt?.trim();
      if (!prompt || !navigator?.clipboard) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    }
  };

  const coverage = finalOptions?.coverage ?? {
    requiredPlatforms: ["youtube", "x", "reddit", "substack"] as const,
    completedPlatforms: [],
    missingPlatforms: [],
    readyForLovable: false
  };
  const groupedEvidence = (finalOptions?.lovableHandoff?.evidence ?? []).reduce<Record<string, Array<{
    id: string;
    platform: string;
    title: string;
    keywords: string;
    summary: string;
    url: string;
  }>>>((groups, evidence) => {
    const key = evidence.platform || "other";
    groups[key] = [...(groups[key] ?? []), evidence];
    return groups;
  }, {});

  return (
    <>
      {showFinalOptions && finalOptions ? (
        <div
          ref={finalOptionsRef}
          data-testid="final-options-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={finalOptionsTitleId}
          aria-describedby={finalOptionsDescriptionId}
          tabIndex={-1}
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
            <div
              id={finalOptionsTitleId}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#a855f7" }}
            >
              <Lightbulb size={14} />
              {finalOptions.isFinal ? "Final Options" : "Market Research Snapshot"}
            </div>
            <button
              ref={closeFinalOptionsButtonRef}
              type="button"
              onClick={() => setShowFinalOptions(false)}
              aria-label="Close final options dialog"
              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, padding: "0 4px" }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div
                id={finalOptionsDescriptionId}
                style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "#94a3b8" }}
              >
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

            <div
              data-testid="final-implementation-plan"
              style={{
                display: "grid",
                gap: 14,
                padding: 18,
                borderRadius: 18,
                border: "1px solid rgba(34, 211, 238, 0.28)",
                background: "linear-gradient(180deg, rgba(6, 16, 28, 0.96) 0%, rgba(7, 18, 34, 0.88) 100%)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: "#22d3ee" }}>
                    Final Implementation Plan
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc" }}>
                    {finalOptions.implementationPlan?.title || finalOptions.lovableHandoff?.title || finalOptions.options[0]?.title || "Validated MVP"}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#cbd5e1" }}>
                    {finalOptions.implementationPlan?.oneLiner || finalOptions.options[0]?.concept || finalOptions.marketResearch.summary}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                  <div style={{
                    borderRadius: 999,
                    border: "1px solid rgba(34, 211, 238, 0.32)",
                    color: "#67e8f9",
                    padding: "6px 10px",
                    fontSize: 10,
                    letterSpacing: 1.3,
                    textTransform: "uppercase"
                  }}>
                    {finalOptions.implementationPlan?.generatedBy || "MiniMax-M2.7"}
                  </div>
                  {coverage.readyForLovable && finalOptions.lovableHandoff?.launchUrl ? (
                    <a
                      data-testid="lovable-launch-link"
                      href={finalOptions.lovableHandoff.launchUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(34, 211, 238, 0.4)",
                        background: "linear-gradient(135deg, #22d3ee 0%, #0ea5e9 100%)",
                        color: "#03111d",
                        fontSize: 12,
                        fontWeight: 700,
                        textDecoration: "none"
                      }}
                    >
                      Build in Lovable
                    </a>
                  ) : (
                    <button
                      data-testid="lovable-launch-disabled"
                      disabled
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(71, 85, 105, 0.4)",
                        background: "rgba(15, 23, 42, 0.75)",
                        color: "#64748b",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "not-allowed"
                      }}
                    >
                      Build in Lovable
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="lovable-copy-prompt"
                    onClick={handleCopyLovablePrompt}
                    aria-live="polite"
                    style={{
                      padding: "9px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(148, 163, 184, 0.26)",
                      background: "rgba(2, 6, 14, 0.72)",
                      color: "#cbd5e1",
                      fontSize: 11,
                      cursor: "pointer"
                    }}
                  >
                    {copyStatus === "copied" ? "Prompt Copied" : copyStatus === "error" ? "Copy Failed" : "Copy Lovable Prompt"}
                  </button>
                </div>
              </div>

              {!coverage.readyForLovable ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "#fca5a5" }}>
                    Lovable launch is disabled until research captures validated discoveries from all four platforms.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {coverage.missingPlatforms.map((platform) => (
                      <div
                        key={platform}
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(248, 113, 113, 0.32)",
                          color: "#fca5a5",
                          padding: "6px 10px",
                          fontSize: 10,
                          letterSpacing: 1.1,
                          textTransform: "uppercase"
                        }}
                      >
                        Missing {platform}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 10, fontSize: 12, color: "#dbeafe" }}>
                <div><span style={{ color: "#94a3b8" }}>Problem:</span> {finalOptions.implementationPlan?.problem}</div>
                <div><span style={{ color: "#94a3b8" }}>Target users:</span> {finalOptions.implementationPlan?.targetUsers}</div>
                <div><span style={{ color: "#94a3b8" }}>Value prop:</span> {finalOptions.implementationPlan?.valueProp}</div>
                <div><span style={{ color: "#94a3b8" }}>Why now:</span> {finalOptions.implementationPlan?.whyNow}</div>
                <div><span style={{ color: "#94a3b8" }}>Monetization:</span> {finalOptions.implementationPlan?.monetization}</div>
              </div>

              {finalOptions.implementationPlan?.coreUserFlows?.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#94a3b8" }}>
                    Core User Flows
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {finalOptions.implementationPlan.coreUserFlows.map((flow) => (
                      <div key={flow} style={{ fontSize: 11.5, color: "#e2e8f0" }}>• {flow}</div>
                    ))}
                  </div>
                </div>
              ) : null}

              {finalOptions.implementationPlan?.screens?.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#94a3b8" }}>
                    Screens
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {finalOptions.implementationPlan.screens.map((screen) => (
                      <div key={screen.name} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(2, 6, 14, 0.72)", border: "1px solid rgba(71, 85, 105, 0.22)" }}>
                        <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 600 }}>{screen.name}</div>
                        <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4 }}>{screen.purpose}</div>
                        {screen.modules?.length ? (
                          <div style={{ marginTop: 6, fontSize: 10.5, color: "#94a3b8" }}>
                            Modules: {screen.modules.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {finalOptions.implementationPlan?.dataModel?.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#94a3b8" }}>
                    Data Model
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {finalOptions.implementationPlan.dataModel.map((entity) => (
                      <div key={entity.entity} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(2, 6, 14, 0.72)", border: "1px solid rgba(71, 85, 105, 0.22)" }}>
                        <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 600 }}>{entity.entity}</div>
                        <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4 }}>{entity.purpose}</div>
                        {entity.fields?.length ? (
                          <div style={{ marginTop: 6, fontSize: 10.5, color: "#94a3b8" }}>
                            Fields: {entity.fields.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {finalOptions.implementationPlan?.launchPlan?.length || finalOptions.implementationPlan?.successMetrics?.length ? (
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#94a3b8" }}>
                      Launch Plan
                    </div>
                    {(finalOptions.implementationPlan?.launchPlan ?? []).map((step) => (
                      <div key={step} style={{ fontSize: 11.5, color: "#e2e8f0" }}>• {step}</div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#94a3b8" }}>
                      Success Metrics
                    </div>
                    {(finalOptions.implementationPlan?.successMetrics ?? []).map((metric) => (
                      <div key={metric} style={{ fontSize: 11.5, color: "#e2e8f0" }}>• {metric}</div>
                    ))}
                  </div>
                </div>
              ) : null}

              {Object.keys(groupedEvidence).length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#94a3b8" }}>
                    Evidence by Platform
                  </div>
                  {Object.entries(groupedEvidence).map(([platform, evidenceItems]) => (
                    <div key={platform} style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#67e8f9", letterSpacing: 1.2 }}>
                        {platform}
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {evidenceItems.map((evidence) => (
                          <a
                            key={`${platform}-${evidence.id}-${evidence.url}`}
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
                    border: option.id === finalOptions.primaryOptionId ? "1px solid rgba(34, 211, 238, 0.32)" : "1px solid rgba(124, 58, 237, 0.22)",
                    background: option.id === finalOptions.primaryOptionId ? "rgba(6, 18, 29, 0.88)" : "rgba(9, 14, 28, 0.82)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>{option.title}</div>
                      {option.id === finalOptions.primaryOptionId ? (
                        <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "#67e8f9" }}>
                          Primary Winner
                        </div>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: option.id === finalOptions.primaryOptionId ? "#67e8f9" : "#a855f7" }}>
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

      {/* ── Header bar ── */}
      <div
        style={{
          position: "fixed",
          inset: "0 0 auto 0",
          padding: "14px 22px",
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
          <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
            Local Browser Use command center
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
            <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "#475569" }}>Operator</div>
            <div style={{ fontSize: 11, color: "#cbd5e1" }}>{userEmail}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: isRunning ? "#34d399" : "#64748b" }}>
            <Activity size={13} />
            <span>{activeAgentCount} ACTIVE</span>
          </div>

          {/* View mode toggle — integrated in header */}
          <div
            style={{
              display: "flex",
              gap: 3,
              background: "rgba(0,0,0,0.5)",
              borderRadius: 8,
              padding: 3,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {([
              { key: "command" as const, label: "Command Center", icon: Monitor },
              { key: "observe" as const, label: "Agent Stream", icon: Eye },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => onViewModeChange(key)}
                title={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: viewMode === key ? "rgba(139,92,246,0.25)" : "transparent",
                  color: viewMode === key ? "#c4b5fd" : "rgba(255,255,255,0.4)",
                  fontSize: 11,
                  fontWeight: viewMode === key ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
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
            onClick={handleReset}
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
