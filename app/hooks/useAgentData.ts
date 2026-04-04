"use client";

export const AGENTS = [
  { id: "youtube-1", agentId: 1, name: "Echo", color: "#ff0033", baseRole: "Video Scan", platform: "youtube" },
  { id: "x-1", agentId: 2, name: "Pulse", color: "#dbe4ee", baseRole: "Conversation Scan", platform: "x" },
  { id: "reddit-1", agentId: 3, name: "Thread", color: "#ff6b35", baseRole: "Community Scan", platform: "reddit" },
  { id: "substack-1", agentId: 4, name: "Ledger", color: "#18b47b", baseRole: "Narrative Scan", platform: "substack" },
  { id: "research-1", agentId: 5, name: "Atlas", color: "#8b5cf6", baseRole: "Market Research", platform: "market_research" }
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
  type:
    | "search"
    | "analysis"
    | "likes"
    | "discovery"
    | "energy_gain"
    | "energy_loss"
    | "task_swap"
    | "status"
    | "error"
    | "refinement"
    | "market_research"
    | "final_options";
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

export interface AgentThought {
  _id: string;
  agent_id: number | null;
  thought_type: "inference" | "strategy" | "refinement" | "planning" | "action";
  prompt_summary: string;
  response_summary: string;
  action_taken: string;
  model: string;
  tokens_used: number;
  duration_ms: number;
  timestamp: number;
}

export interface AgentMemoryEntry {
  _id: string;
  filename: string;
  content: string;
  version: number;
  updated_by: string | null;
  timestamp: number;
}

export interface BusinessPlan {
  _id: string;
  version: number;
  market_opportunity: string;
  competitive_landscape: string;
  revenue_models: string;
  user_acquisition: string;
  risk_analysis: string;
  confidence_score: number;
  discovery_count: number;
  is_final: boolean;
  raw_plan: string;
  timestamp: number;
}

export const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#ff0033",
  x: "#dbe4ee",
  reddit: "#ff6b35",
  substack: "#18b47b",
  market_research: "#8b5cf6",
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
    case "refinement":
      return "💡";
    case "market_research":
      return "📈";
    case "final_options":
      return "🧭";
    default:
      return "•";
  }
}
