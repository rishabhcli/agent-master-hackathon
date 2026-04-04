"use client";

import { Bot, Brain, Lightbulb, Search, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAgentById, PLATFORM_COLORS, type AgentThought, type AgentSignal, type LogEntry } from "../hooks/useAgentData";

type FeedItem = {
  id: string;
  timestamp: number;
  type: "thought" | "signal" | "log";
  agentId: number | null;
  content: string;
  detail: string;
  subtype: string;
};

interface Props {
  thoughts: AgentThought[];
  signals: AgentSignal[];
  logs: LogEntry[];
}

function agentColor(agentId: number | null): string {
  if (agentId == null) return "#8b5cf6";
  const agent = getAgentById(agentId);
  if (agent) return PLATFORM_COLORS[agent.platform] ?? "#6366f1";
  return "#6366f1";
}

const THOUGHT_ICONS: Record<string, typeof Brain> = {
  inference: Brain,
  strategy: Lightbulb,
  refinement: Zap,
  planning: Search,
  action: Bot,
};

export function AgentConversationFeed({ thoughts, signals, logs }: Props) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | "thoughts" | "signals" | "logs">("all");

  const items: FeedItem[] = [];

  for (const t of thoughts) {
    items.push({
      id: `t-${t._id}`,
      timestamp: t.timestamp,
      type: "thought",
      agentId: t.agent_id,
      content: t.response_summary || t.prompt_summary,
      detail: `${t.model} · ${t.tokens_used} tok · ${t.duration_ms}ms`,
      subtype: t.thought_type,
    });
  }
  for (const s of signals) {
    items.push({
      id: `s-${s._id}`,
      timestamp: s.timestamp,
      type: "signal",
      agentId: s.fromAgent,
      content: `→ Agent ${s.toAgent}: ${s.signalType}`,
      detail: s.message.slice(0, 120),
      subtype: s.signalType,
    });
  }
  for (const l of logs) {
    items.push({
      id: `l-${l._id}`,
      timestamp: l.timestamp,
      type: "log",
      agentId: l.agent_id,
      content: l.message,
      detail: l.type,
      subtype: l.type,
    });
  }

  const filtered = items
    .filter((i) => filter === "all" || (filter === "thoughts" && i.type === "thought") || (filter === "signals" && i.type === "signal") || (filter === "logs" && i.type === "log"))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [filtered.length]);

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, padding: "4px 0" }}>
        {(["all", "thoughts", "signals", "logs"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid",
              borderColor: filter === f ? "#8b5cf6" : "rgba(255,255,255,0.15)",
              background: filter === f ? "rgba(139,92,246,0.2)" : "transparent",
              color: filter === f ? "#c4b5fd" : "rgba(255,255,255,0.5)",
              fontSize: 11,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          {filtered.length} events
        </span>
      </div>

      {/* Feed */}
      <div ref={feedRef} style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {filtered.map((item) => {
          const color = agentColor(item.agentId);
          const Icon = item.type === "thought" ? (THOUGHT_ICONS[item.subtype] ?? Brain) : item.type === "signal" ? Zap : Bot;
          const agentInfo = item.agentId != null ? getAgentById(item.agentId) : null;
          const label = agentInfo ? `${agentInfo.name}` : item.agentId != null ? `Agent ${item.agentId}` : "Orchestrator";

          return (
            <div
              key={item.id}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                borderLeft: `3px solid ${color}`,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <Icon size={13} style={{ color, flexShrink: 0 }} />
                <span style={{ color, fontWeight: 600, fontSize: 11 }}>{label}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>
                  {formatTime(item.timestamp)}
                </span>
              </div>
              <div style={{ color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>{item.content}</div>
              {item.detail && (
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 }}>{item.detail}</div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 40, fontSize: 13 }}>
            No events yet — agents will appear here once the mission starts.
          </div>
        )}
      </div>
    </div>
  );
}
