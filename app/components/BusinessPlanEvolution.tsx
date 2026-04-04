"use client";

import { BarChart3, CheckCircle2, TrendingUp } from "lucide-react";
import type { BusinessPlan } from "../hooks/useAgentData";

interface Props {
  plans: BusinessPlan[];
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#eab308" : "#ef4444";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 12,
        background: `${color}22`,
        color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <TrendingUp size={11} />
      {score}%
    </span>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  if (!content || content === "Pending..." || content.startsWith("Pending")) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        {content}
      </div>
    </div>
  );
}

export function BusinessPlanEvolution({ plans }: Props) {
  if (plans.length === 0) {
    return (
      <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 40, fontSize: 13 }}>
        No business plan synthesized yet — waiting for research agent discoveries.
      </div>
    );
  }

  const latest = plans[0]; // sorted desc by created_at
  const history = plans.slice(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", overflow: "auto" }}>
      {/* Current plan header */}
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: latest.is_final ? "rgba(34,197,94,0.08)" : "rgba(139,92,246,0.08)",
          border: `1px solid ${latest.is_final ? "rgba(34,197,94,0.25)" : "rgba(139,92,246,0.25)"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {latest.is_final ? <CheckCircle2 size={16} style={{ color: "#22c55e" }} /> : <BarChart3 size={16} style={{ color: "#8b5cf6" }} />}
          <span style={{ fontWeight: 700, color: "white", fontSize: 14 }}>
            {latest.is_final ? "Final Business Plan" : `Business Plan v${latest.version}`}
          </span>
          <ConfidenceBadge score={latest.confidence_score} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>
            {latest.discovery_count} discoveries
          </span>
        </div>

        <Section title="Market Opportunity" content={latest.market_opportunity} />
        <Section title="Competitive Landscape" content={latest.competitive_landscape} />
        <Section title="Revenue Models" content={latest.revenue_models} />
        <Section title="User Acquisition" content={latest.user_acquisition} />
        <Section title="Risk & Moat Analysis" content={latest.risk_analysis} />
      </div>

      {/* Version history */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Previous Versions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((plan) => (
              <div
                key={plan._id}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.03)",
                  borderLeft: "3px solid rgba(139,92,246,0.3)",
                  fontSize: 11,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>v{plan.version}</span>
                  <ConfidenceBadge score={plan.confidence_score} />
                  <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: "auto", fontSize: 10 }}>
                    {plan.discovery_count} disc · {new Date(plan.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
