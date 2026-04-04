"use client";

import { BarChart3, Brain, FileText, MessageSquare } from "lucide-react";
import { useState } from "react";
import type { AgentMemoryEntry, AgentSignal, AgentThought, BusinessPlan, LogEntry } from "../hooks/useAgentData";
import { AgentConversationFeed } from "./AgentConversationFeed";
import { BusinessPlanEvolution } from "./BusinessPlanEvolution";

type Tab = "feed" | "plan" | "memory";

interface Props {
  thoughts: AgentThought[];
  signals: AgentSignal[];
  logs: LogEntry[];
  memory: AgentMemoryEntry[];
  businessPlans: BusinessPlan[];
}

const TABS: { key: Tab; label: string; icon: typeof Brain }[] = [
  { key: "feed", label: "Agent Feed", icon: MessageSquare },
  { key: "plan", label: "Business Plan", icon: BarChart3 },
  { key: "memory", label: "Shared Memory", icon: FileText },
];

function MemoryView({ memory }: { memory: AgentMemoryEntry[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = [...memory].sort((a, b) => a.filename.localeCompare(b.filename));
  const active = sorted.find((m) => m.filename === selected) ?? sorted[0] ?? null;

  return (
    <div style={{ display: "flex", height: "100%", gap: 8 }}>
      {/* File list */}
      <div style={{ width: 160, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {sorted.map((m) => (
          <button
            key={m.filename}
            onClick={() => setSelected(m.filename)}
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              border: "none",
              background: active?.filename === m.filename ? "rgba(139,92,246,0.2)" : "transparent",
              color: active?.filename === m.filename ? "#c4b5fd" : "rgba(255,255,255,0.5)",
              fontSize: 11,
              textAlign: "left",
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <FileText size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
            {m.filename}
            <span style={{ color: "rgba(255,255,255,0.2)", marginLeft: 4 }}>v{m.version}</span>
          </button>
        ))}
        {sorted.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: 8 }}>No memory files yet</div>
        )}
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8, fontSize: 12 }}>
        {active ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: "#c4b5fd", fontWeight: 600, fontSize: 13 }}>{active.filename}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                v{active.version} · by {active.updated_by ?? "unknown"} · {new Date(active.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <pre style={{ color: "rgba(255,255,255,0.75)", whiteSpace: "pre-wrap", lineHeight: 1.5, margin: 0, fontFamily: "inherit" }}>
              {active.content || "(empty)"}
            </pre>
          </>
        ) : (
          <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 40 }}>
            Select a memory file to view its contents.
          </div>
        )}
      </div>
    </div>
  );
}

export function ObservabilityDashboard({ thoughts, signals, logs, memory, businessPlans }: Props) {
  const [tab, setTab] = useState<Tab>("feed");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: tab === key ? "rgba(139,92,246,0.15)" : "transparent",
              color: tab === key ? "#c4b5fd" : "rgba(255,255,255,0.4)",
              fontSize: 12,
              fontWeight: tab === key ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <Icon size={13} />
            {label}
            {key === "feed" && thoughts.length > 0 && (
              <span style={{ fontSize: 9, background: "rgba(139,92,246,0.3)", padding: "1px 5px", borderRadius: 8, color: "#c4b5fd" }}>
                {thoughts.length}
              </span>
            )}
            {key === "plan" && businessPlans.length > 0 && (
              <span style={{ fontSize: 9, background: "rgba(34,197,94,0.3)", padding: "1px 5px", borderRadius: 8, color: "#86efac" }}>
                v{businessPlans[0].version}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "hidden", paddingTop: 8 }}>
        {tab === "feed" && <AgentConversationFeed thoughts={thoughts} signals={signals} logs={logs} />}
        {tab === "plan" && <BusinessPlanEvolution plans={businessPlans} />}
        {tab === "memory" && <MemoryView memory={memory} />}
      </div>
    </div>
  );
}
