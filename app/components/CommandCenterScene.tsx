"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { useMemo } from "react";
import { AgentPlane } from "./AgentPlane";
import { BlackboardSphere } from "./BlackboardSphere";
import { ConnectionLines } from "./ConnectionLines";
import { CosmeticOrbs } from "./CosmeticOrbs";
import { SignalParticles } from "./SignalParticle";
import { AGENTS, type AgentData, type AgentSignal } from "../hooks/useAgentData";

function layoutAgents() {
  return AGENTS.map((agent, index) => {
    const angle = (index / AGENTS.length) * Math.PI * 2;
    const radius = 4.2;
    return {
      ...agent,
      position: [Math.sin(angle) * radius, 0.15, Math.cos(angle) * radius] as [number, number, number],
      rotation: [0, -angle, 0] as [number, number, number]
    };
  });
}

export function CommandCenterScene({
  agents,
  signals,
  liveUrls,
  isRunning
}: {
  agents: AgentData[];
  signals: AgentSignal[];
  liveUrls: Record<number, string | null>;
  isRunning: boolean;
}) {
  const layout = useMemo(() => layoutAgents(), []);
  const agentMap = useMemo(() => {
    const map = new Map<number, AgentData>();
    for (const agent of agents) {
      map.set(agent.agent_id, agent);
    }
    return map;
  }, [agents]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas camera={{ position: [0, 2.6, 6.6], fov: 52 }}>
        <ambientLight intensity={0.28} />
        <directionalLight intensity={0.65} position={[4, 5, 4]} color="#7dd3fc" />
        <pointLight intensity={1.1} position={[0, 1.2, 0]} color="#22d3ee" />
        <fog attach="fog" args={["#020408", 8, 22]} />
        <Stars radius={80} depth={70} count={2600} factor={3} fade speed={0.2} />

        <OrbitControls
          enablePan={false}
          minDistance={3.8}
          maxDistance={11}
          minPolarAngle={Math.PI * 0.24}
          maxPolarAngle={Math.PI * 0.62}
          autoRotate={!isRunning}
          autoRotateSpeed={0.4}
          target={[0, 0.35, 0]}
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
          <circleGeometry args={[7.5, 60]} />
          <meshBasicMaterial color="#06101d" transparent opacity={0.65} />
        </mesh>

        <BlackboardSphere isActive={isRunning} />
        <ConnectionLines isActive={isRunning} />
        <SignalParticles signals={signals} />
        <CosmeticOrbs isActive={isRunning} />

        {layout.map((agent) => (
          <AgentPlane
            key={agent.agentId}
            position={agent.position}
            rotation={agent.rotation}
            agentName={agent.name}
            agentColor={agent.color}
            agentRole={agent.baseRole}
            agentId={agent.agentId}
            status={agentMap.get(agent.agentId)?.status ?? "idle"}
            liveUrl={liveUrls[agent.agentId] ?? null}
            isActive={Boolean(liveUrls[agent.agentId])}
          />
        ))}
      </Canvas>
    </div>
  );
}
