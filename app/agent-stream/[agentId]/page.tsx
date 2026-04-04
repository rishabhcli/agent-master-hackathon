import { AgentPreviewSurface } from "../../components/AgentPreviewSurface";

export const dynamic = "force-dynamic";

export default function AgentStreamPage({
  params
}: {
  params: { agentId: string };
}) {
  const agentId = Number(params.agentId);
  if (!Number.isFinite(agentId) || agentId < 1 || agentId > 9) {
    return null;
  }

  return <AgentPreviewSurface agentId={agentId} />;
}
