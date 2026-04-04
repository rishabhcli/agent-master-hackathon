"use client";

/* eslint-disable @next/next/no-img-element */

import { useAgentPreview } from "../hooks/useAgentPreview";

export function AgentPreviewSurface({ agentId }: { agentId: number }) {
  const { frameUrl, metadata, accessError } = useAgentPreview(agentId);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "grid",
        gridTemplateRows: "1fr auto",
        background: "#020408",
        color: "#dbe7f3",
        fontFamily: "'JetBrains Mono', monospace"
      }}
    >
      <div style={{ position: "relative", overflow: "hidden", background: "#020408" }}>
        <img
          src={frameUrl}
          alt={`Agent ${agentId} preview`}
          suppressHydrationWarning
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>

      <div
        style={{
          padding: "12px 14px",
          display: "grid",
          gap: 6,
          borderTop: "1px solid rgba(71, 85, 105, 0.35)",
          background: "rgba(2, 6, 14, 0.96)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "#22d3ee" }}>
            Agent {agentId}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>{metadata.status}</div>
        </div>

        <div style={{ fontSize: 12, color: "#e2e8f0" }}>{metadata.title}</div>

        <div style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {metadata.currentUrl || metadata.note}
        </div>

        <div style={{ fontSize: 10, color: accessError ? "#fca5a5" : "#475569" }}>
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
