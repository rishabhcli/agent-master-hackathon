"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export const AgentClusterNode = memo(function AgentClusterNode({ data }: NodeProps) {
  const payload = data as { agentId: number; agentName: string; agentColor: string; count: number };

  return (
    <div
      style={{
        width: 180,
        padding: 14,
        borderRadius: 14,
        border: `1px solid ${payload.agentColor}33`,
        background: "rgba(5, 10, 18, 0.86)",
        boxShadow: `0 10px 24px ${payload.agentColor}18`,
        fontFamily: "'JetBrains Mono', monospace"
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: payload.agentColor }} />
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: payload.agentColor }}>
        Agent {payload.agentId}
      </div>
      <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{payload.agentName}</div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>{payload.count} discoveries linked</div>
    </div>
  );
});
