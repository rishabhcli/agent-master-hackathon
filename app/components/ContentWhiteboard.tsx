"use client";

import "@xyflow/react/dist/style.css";
import { useEffect } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes
} from "@xyflow/react";
import { AgentClusterNode } from "./AgentClusterNode";
import { ContentNode } from "./ContentNode";
import { getAgentById, type DiscoveredContent } from "../hooks/useAgentData";

const nodeTypes: NodeTypes = {
  content: ContentNode,
  agentCluster: AgentClusterNode
};

export function ContentWhiteboard({
  content,
  isRunning
}: {
  content: DiscoveredContent[];
  isRunning: boolean;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const contentNodes: Node[] = content.slice(0, 100).map((item, index) => ({
      id: item._id,
      type: "content",
      position: {
        x: 50 + (index % 2) * 330,
        y: 90 + Math.floor(index / 2) * 280
      },
      data: item as unknown as Record<string, unknown>
    }));

    const agentCounts = new Map<number, number>();
    for (const item of content) {
      agentCounts.set(item.found_by_agent_id, (agentCounts.get(item.found_by_agent_id) ?? 0) + 1);
    }

    const clusterNodes: Node[] = [...agentCounts.entries()].map(([agentId, count], index) => {
      const agent = getAgentById(agentId);
      return {
        id: `cluster-${agentId}`,
        type: "agentCluster",
        position: { x: 740, y: 90 + index * 100 },
        data: {
          agentId,
          agentName: agent.name,
          agentColor: agent.color,
          count
        } as Record<string, unknown>
      };
    });

    const newEdges: Edge[] = content.slice(0, 100).map((item) => ({
      id: `edge-${item._id}`,
      source: item._id,
      target: `cluster-${item.found_by_agent_id}`,
      animated: true,
      style: {
        stroke: getAgentById(item.found_by_agent_id).color,
        opacity: 0.32
      }
    }));

    setNodes([...contentNodes, ...clusterNodes]);
    setEdges(newEdges);
  }, [content, setEdges, setNodes]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: "18px 18px 0",
          pointerEvents: "none"
        }}
      >
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#34d399" }}>
          Discovery Blackboard
        </div>
        <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 13 }}>
          {content.length > 0 ? `${content.length} discoveries captured` : isRunning ? "Agents are scanning the web..." : "Launch a mission to start discovery"}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        style={{ background: "linear-gradient(180deg, rgba(2,4,8,0.9), rgba(2,4,8,0.98))" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="rgba(51, 65, 85, 0.45)" />
        <MiniMap pannable zoomable style={{ background: "#020408", border: "1px solid rgba(100,116,139,0.2)" }} />
        <Controls style={{ background: "#08111f", border: "1px solid rgba(100,116,139,0.2)" }} />
      </ReactFlow>
    </div>
  );
}
