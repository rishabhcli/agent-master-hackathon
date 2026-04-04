"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";

interface PreviewMetadata {
  agentId: number;
  status: string;
  title: string;
  currentUrl: string;
  updatedAt: string | null;
  heartbeatAt: string | null;
  note: string;
}

const FALLBACK_METADATA: PreviewMetadata = {
  agentId: 0,
  status: "idle",
  title: "Waiting for local browser session",
  currentUrl: "",
  updatedAt: null,
  heartbeatAt: null,
  note: "The local worker has not written its first preview frame yet."
};

export function AgentPreviewSurface({ agentId }: { agentId: number }) {
  const [tick, setTick] = useState(0);
  const [metadata, setMetadata] = useState<PreviewMetadata>(FALLBACK_METADATA);

  useEffect(() => {
    let isMounted = true;

    const loadMetadata = async () => {
      try {
        const response = await fetch(`/api/agent-stream/${agentId}/status`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("status fetch failed");
        }

        const nextMetadata = (await response.json()) as PreviewMetadata;
        if (isMounted) {
          setMetadata(nextMetadata);
        }
      } catch {
        if (isMounted) {
          setMetadata({
            ...FALLBACK_METADATA,
            agentId
          });
        }
      }
    };

    setTick(Date.now());
    void loadMetadata();
    const interval = window.setInterval(() => {
      setTick(Date.now());
      void loadMetadata();
    }, 2000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [agentId]);

  const frameUrl = useMemo(() => {
    if (tick === 0) {
      return `/api/agent-stream/${agentId}/frame`;
    }
    return `/api/agent-stream/${agentId}/frame?ts=${tick}`;
  }, [agentId, tick]);

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

        <div style={{ fontSize: 10, color: "#475569" }}>
          {metadata.updatedAt ? `Updated ${new Date(metadata.updatedAt).toLocaleTimeString()}` : "Awaiting first frame"}
        </div>
      </div>
    </div>
  );
}
