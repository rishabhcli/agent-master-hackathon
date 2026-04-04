"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearPreviewAccessTokenCookie,
  insforge,
  isUnsignedSessionError,
  isPreviewAuthBypassed,
  primeInsforgeAccessTokenFromCookie,
  shouldBootstrapInsforgeSession,
  syncPreviewAccessTokenCookie
} from "../lib/insforge";

interface PreviewMetadata {
  agentId: number;
  status: string;
  title: string;
  currentUrl: string;
  updatedAt: string | null;
  heartbeatAt: string | null;
  note: string;
}

interface AgentPreviewRecord {
  agent_id: number;
  status: string;
  current_url: string;
  assignment: string;
  last_heartbeat: string | null;
  updated_at: string | null;
  preview_bucket: string | null;
  preview_key: string | null;
  preview_updated_at: string | null;
}

const FALLBACK_METADATA: PreviewMetadata = {
  agentId: 0,
  status: "idle",
  title: "Waiting for browser relay",
  currentUrl: "",
  updatedAt: null,
  heartbeatAt: null,
  note: "The local worker has not published a preview frame yet."
};

function placeholderFrameUrl(agentId: number, label: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <rect width="1280" height="720" fill="#020408" />
      <circle cx="640" cy="280" r="140" fill="rgba(34,211,238,0.08)" stroke="rgba(34,211,238,0.28)" />
      <text x="640" y="304" text-anchor="middle" fill="#22d3ee" font-size="42" font-family="monospace">AGENT ${agentId}</text>
      <text x="640" y="370" text-anchor="middle" fill="#94a3b8" font-size="22" font-family="monospace">${label}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

let previewRealtimePromise: Promise<void> | null = null;

async function ensurePreviewRealtime() {
  if (previewRealtimePromise) {
    return previewRealtimePromise;
  }

  previewRealtimePromise = (async () => {
    await insforge.realtime.connect();
    const result = await insforge.realtime.subscribe("agents");
    if (!result.ok) {
      throw new Error(result.error?.message ?? "Failed to subscribe to agents realtime.");
    }
  })().catch((caughtError) => {
    previewRealtimePromise = null;
    throw caughtError;
  });

  return previewRealtimePromise;
}

export function AgentPreviewSurface({ agentId }: { agentId: number }) {
  const [frameUrl, setFrameUrl] = useState(() => placeholderFrameUrl(agentId, "Initializing relay"));
  const [metadata, setMetadata] = useState<PreviewMetadata>({
    ...FALLBACK_METADATA,
    agentId
  });
  const [accessError, setAccessError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const lastPreviewKeyRef = useRef<string | null>(null);

  const fallbackFrameUrl = useMemo(() => `/api/agent-stream/${agentId}/frame`, [agentId]);

  useEffect(() => {
    let isMounted = true;

    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    const loadPreview = async () => {
      try {
        const allowGuestPreview = isPreviewAuthBypassed();

        if (!allowGuestPreview && !shouldBootstrapInsforgeSession()) {
          if (!isMounted) return;
          clearPreviewAccessTokenCookie();
          setAccessError("Sign in to view the live local browser relay.");
          setMetadata({
            agentId,
            status: "locked",
            title: "Authentication required",
            currentUrl: "",
            updatedAt: null,
            heartbeatAt: null,
            note: "This panel is protected by InsForge authentication."
          });
          revokeObjectUrl();
          lastPreviewKeyRef.current = null;
          setFrameUrl(placeholderFrameUrl(agentId, "Authentication required"));
          return;
        }

        if (!allowGuestPreview) {
          primeInsforgeAccessTokenFromCookie();
          const session = await insforge.auth.getCurrentUser();
          if (session.error && !isUnsignedSessionError(session.error)) {
            throw session.error;
          }

          if (!session.data?.user) {
            if (!isMounted) return;
            clearPreviewAccessTokenCookie();
            setAccessError("Sign in to view the live local browser relay.");
            setMetadata({
              agentId,
              status: "locked",
              title: "Authentication required",
              currentUrl: "",
              updatedAt: null,
              heartbeatAt: null,
              note: "This panel is protected by InsForge authentication."
            });
            revokeObjectUrl();
            lastPreviewKeyRef.current = null;
            setFrameUrl(placeholderFrameUrl(agentId, "Authentication required"));
            return;
          }

          syncPreviewAccessTokenCookie();
        }

        const result = await insforge.database
          .from("agents")
          .select("agent_id,status,current_url,assignment,last_heartbeat,updated_at,preview_bucket,preview_key,preview_updated_at")
          .eq("agent_id", agentId)
          .maybeSingle();

        if (result.error) {
          throw result.error;
        }

        const record = result.data as AgentPreviewRecord | null;
        if (!record) {
          if (!isMounted) return;
          setAccessError(null);
          setMetadata({
            ...FALLBACK_METADATA,
            agentId
          });
          revokeObjectUrl();
          setFrameUrl(fallbackFrameUrl);
          return;
        }

        if (!isMounted) return;

        setAccessError(null);
        setMetadata({
          agentId,
          status: record.status || "idle",
          title: record.assignment || "Awaiting assignment",
          currentUrl: record.current_url || "",
          updatedAt: record.preview_updated_at ?? record.updated_at,
          heartbeatAt: record.last_heartbeat,
          note: record.assignment || "Waiting for browser relay"
        });

        if (record.preview_bucket && record.preview_key && record.preview_key !== lastPreviewKeyRef.current) {
          const download = await insforge.storage.from(record.preview_bucket).download(record.preview_key);
          if (download.error) {
            throw download.error;
          }

          if (!download.data || !isMounted) {
            return;
          }

          revokeObjectUrl();
          const nextObjectUrl = URL.createObjectURL(download.data);
          objectUrlRef.current = nextObjectUrl;
          lastPreviewKeyRef.current = record.preview_key;
          setFrameUrl(nextObjectUrl);
        } else if (!record.preview_key) {
          revokeObjectUrl();
          lastPreviewKeyRef.current = null;
          setFrameUrl(`${fallbackFrameUrl}?ts=${Date.now()}`);
        }
      } catch (caughtError) {
        if (!isMounted) return;
        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to load the live preview.";
        setAccessError(message);
        setMetadata({
          agentId,
          status: "degraded",
          title: "Preview unavailable",
          currentUrl: "",
          updatedAt: null,
          heartbeatAt: null,
          note: message
        });
        revokeObjectUrl();
        lastPreviewKeyRef.current = null;
        setFrameUrl(`${fallbackFrameUrl}?ts=${Date.now()}`);
      }
    };

    const handleAgentUpdate = (payload: { agent_id?: number }) => {
      if (payload?.agent_id === agentId) {
        void loadPreview();
      }
    };

    insforge.realtime.on("agents_changed", handleAgentUpdate);
    void ensurePreviewRealtime().catch(() => {
      previewRealtimePromise = null;
    });

    void loadPreview();
    const interval = window.setInterval(() => {
      void loadPreview();
    }, 3000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      insforge.realtime.off("agents_changed", handleAgentUpdate);
      revokeObjectUrl();
    };
  }, [agentId, fallbackFrameUrl]);

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
