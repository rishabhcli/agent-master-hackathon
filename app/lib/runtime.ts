import path from "node:path";

export function getRuntimeRoot() {
  return process.env.MASTERBUILD_RUNTIME_DIR || path.join(process.cwd(), "runtime");
}

export function getAgentPreviewDirectory(agentId: number) {
  return path.join(getRuntimeRoot(), "previews", `agent-${agentId}`);
}

export function getAgentFramePath(agentId: number) {
  return path.join(getAgentPreviewDirectory(agentId), "latest.jpg");
}

export function getAgentMetadataPath(agentId: number) {
  return path.join(getAgentPreviewDirectory(agentId), "metadata.json");
}
