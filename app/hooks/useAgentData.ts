"use client";

export const AGENTS = [
  { id: "tiktok-1", agentId: 1, name: "Vibe", color: "#00f2ea", baseRole: "Discovery", platform: "tiktok" },
  { id: "tiktok-2", agentId: 2, name: "Pulse", color: "#00d4e0", baseRole: "Collection", platform: "tiktok" },
  { id: "tiktok-3", agentId: 3, name: "Rhythm", color: "#00b6d6", baseRole: "Analysis", platform: "tiktok" },
  { id: "youtube-1", agentId: 4, name: "Echo", color: "#ff0033", baseRole: "Discovery", platform: "youtube" },
  { id: "youtube-2", agentId: 5, name: "Nova", color: "#e6002e", baseRole: "Collection", platform: "youtube" },
  { id: "youtube-3", agentId: 6, name: "Blaze", color: "#cc0029", baseRole: "Analysis", platform: "youtube" },
  { id: "ddg-1", agentId: 7, name: "Cipher", color: "#a855f7", baseRole: "Discovery", platform: "duckduckgo" },
  { id: "ddg-2", agentId: 8, name: "Nexus", color: "#9333ea", baseRole: "Collection", platform: "duckduckgo" },
  { id: "ddg-3", agentId: 9, name: "Oracle", color: "#7c3aed", baseRole: "Analysis", platform: "duckduckgo" }
] as const;

export interface AgentData {
  _id: string;
  agent_id: number;
  status: "idle" | "searching" | "found_trend" | "weak" | "reassigning" | "exploiting" | "stopped" | "error";
  current_url: string;
  profile_id: string;
  energy: number;
}

export interface AgentSignal {
  _id: string;
  fromAgent: number;
  toAgent: number;
  message: string;
  signalType: string;
  timestamp: number;
}

export interface LogEntry {
  _id: string;
  agent_id: number;
  message: string;
  type: "search" | "analysis" | "likes" | "discovery" | "energy_gain" | "energy_loss" | "task_swap" | "status" | "error";
  timestamp: number;
  metadata?: string;
}

export interface DiscoveredContent {
  _id: string;
  video_url: string;
  thumbnail: string;
  found_by_agent_id: number;
  keywords?: string;
  likes?: number;
  views?: number;
  comments?: number;
  _creationTime?: number;
}

export const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#ff0033",
  tiktok: "#00f2ea",
  duckduckgo: "#a855f7",
  web: "#10b981"
};

export function getAgentById(agentId: number) {
  return AGENTS.find((agent) => agent.agentId === agentId) ?? AGENTS[0];
}

export function getLogIcon(type: string) {
  switch (type) {
    case "search":
      return "🔍";
    case "analysis":
      return "📡";
    case "likes":
      return "💠";
    case "discovery":
      return "✨";
    case "energy_gain":
      return "⚡";
    case "energy_loss":
      return "🪫";
    case "task_swap":
      return "🔄";
    case "status":
      return "🛰️";
    case "error":
      return "❌";
    default:
      return "•";
  }
}
