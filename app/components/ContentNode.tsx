"use client";

/* eslint-disable @next/next/no-img-element */

import { memo } from "react";
import { ExternalLink, Eye, Heart, MessageSquare } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getAgentById, PLATFORM_COLORS } from "../hooks/useAgentData";

function platformFromUrl(url: string) {
  if (url.includes("youtube") || url.includes("youtu.be")) return "youtube";
  if (url.includes("x.com")) return "x";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("substack.com")) return "substack";
  return "web";
}

export const ContentNode = memo(function ContentNode({ data }: NodeProps) {
  const item = data as {
    video_url: string;
    thumbnail: string;
    found_by_agent_id: number;
    keywords?: string;
    likes?: number;
    views?: number;
    comments?: number;
  };

  const platform = platformFromUrl(item.video_url);
  const platformColor = PLATFORM_COLORS[platform] ?? "#10b981";
  const agent = getAgentById(item.found_by_agent_id);

  return (
    <div
      style={{
        width: 280,
        borderRadius: 18,
        overflow: "hidden",
        background: "rgba(5, 10, 18, 0.9)",
        border: "1px solid rgba(100, 116, 139, 0.22)",
        boxShadow: "0 20px 48px rgba(0,0,0,0.22)",
        fontFamily: "'JetBrains Mono', monospace"
      }}
    >
      <Handle type="source" position={Position.Right} style={{ background: agent.color }} />
      <Handle type="target" position={Position.Left} style={{ background: "#475569" }} />

      <div style={{ height: 150, position: "relative", background: "#0f172a" }}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="Discovery preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            fontSize: 9,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            padding: "4px 8px",
            borderRadius: 999,
            background: `${platformColor}22`,
            border: `1px solid ${platformColor}44`,
            color: platformColor
          }}
        >
          {platform}
        </div>
      </div>

      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 11, color: agent.color, letterSpacing: 1.2, textTransform: "uppercase" }}>
          Found by {agent.name}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: "#e2e8f0" }}>{item.keywords ?? "No keywords yet"}</div>
        <a
          href={item.video_url}
          target="_blank"
          rel="noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 8, color: "#7dd3fc", fontSize: 11 }}
        >
          <ExternalLink size={12} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.video_url}</span>
        </a>
        <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#94a3b8" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Heart size={12} />
            {item.likes ?? 0}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Eye size={12} />
            {item.views ?? 0}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <MessageSquare size={12} />
            {item.comments ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
});
