"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearPreviewAccessTokenCookie,
  insforge,
  isPreviewAuthBypassed,
  isUnsignedSessionError,
  primeInsforgeAccessTokenFromCookie,
  shouldBootstrapInsforgeSession,
  syncPreviewAccessTokenCookie
} from "../lib/insforge";

export interface AgentPreviewMetadata {
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

const FALLBACK_METADATA: AgentPreviewMetadata = {
  agentId: 0,
  status: "idle",
  title: "Waiting for browser relay",
  currentUrl: "",
  updatedAt: null,
  heartbeatAt: null,
  note: "The local worker has not published a preview frame yet."
};

export function getAgentPlaceholderFrameUrl(agentId: number, label: string) {
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

export function useAgentPreview(
  agentId: number,
  options: {
    enabled?: boolean;
    pollIntervalMs?: number;
  } = {}
) {
  const { enabled = true, pollIntervalMs = 3000 } = options;
  const [frameUrl, setFrameUrl] = useState(() => getAgentPlaceholderFrameUrl(agentId, "Initializing relay"));
  const [metadata, setMetadata] = useState<AgentPreviewMetadata>({
    ...FALLBACK_METADATA,
    agentId
  });
  const [accessError, setAccessError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const lastPreviewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;
    const fallbackFrameUrl = `/api/agent-stream/${agentId}/frame`;

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
          setFrameUrl(getAgentPlaceholderFrameUrl(agentId, "Authentication required"));
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
            setFrameUrl(getAgentPlaceholderFrameUrl(agentId, "Authentication required"));
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
          try {
            const download = await insforge.storage.from(record.preview_bucket).download(record.preview_key);
            if (download.error || !download.data || !isMounted) {
              revokeObjectUrl();
              lastPreviewKeyRef.current = null;
              setFrameUrl(`${fallbackFrameUrl}?ts=${Date.now()}`);
              return;
            }

            revokeObjectUrl();
            const nextObjectUrl = URL.createObjectURL(download.data);
            objectUrlRef.current = nextObjectUrl;
            lastPreviewKeyRef.current = record.preview_key;
            setFrameUrl(nextObjectUrl);
          } catch {
            revokeObjectUrl();
            lastPreviewKeyRef.current = null;
            setFrameUrl(`${fallbackFrameUrl}?ts=${Date.now()}`);
          }
        } else if (!record.preview_key) {
          revokeObjectUrl();
          lastPreviewKeyRef.current = null;
          setFrameUrl(`${fallbackFrameUrl}?ts=${Date.now()}`);
        }
      } catch (caughtError) {
        if (!isMounted) return;

        revokeObjectUrl();
        lastPreviewKeyRef.current = null;
        setFrameUrl(`${fallbackFrameUrl}?ts=${Date.now()}`);

        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to load the live preview.";

        const isAuthError =
          message.toLowerCase().includes("auth") ||
          message.toLowerCase().includes("sign in") ||
          message.toLowerCase().includes("unauthorized");

        if (isAuthError) {
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
        } else {
          setAccessError(null);
        }
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
    }, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      insforge.realtime.off("agents_changed", handleAgentUpdate);
      revokeObjectUrl();
    };
  }, [agentId, enabled, pollIntervalMs]);

  return {
    frameUrl,
    metadata,
    accessError
  };
}
