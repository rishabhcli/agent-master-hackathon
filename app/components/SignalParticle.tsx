"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { AGENTS, type AgentSignal } from "../hooks/useAgentData";

function agentPosition(agentId: number) {
  if (agentId === 0) return new THREE.Vector3(0, 0.4, 0);
  const index = Math.max(0, agentId - 1);
  const angle = (index / AGENTS.length) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(angle) * 4.2, 0.15, Math.cos(angle) * 4.2);
}

function SignalDot({ signal }: { signal: AgentSignal }) {
  const ref = useRef<THREE.Mesh>(null);
  const from = useMemo(() => agentPosition(signal.fromAgent), [signal.fromAgent]);
  const to = useMemo(() => agentPosition(signal.toAgent), [signal.toAgent]);

  useFrame((state) => {
    if (!ref.current) return;
    const age = (Date.now() - signal.timestamp) / 1500;
    const progress = Math.min(1, Math.max(0, age));
    ref.current.position.lerpVectors(from, to, progress);
    ref.current.visible = progress < 1;
    ref.current.scale.setScalar(1 - progress * 0.45);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.07, 10, 10]} />
      <meshBasicMaterial color="#34d399" />
      <Html distanceFactor={10} position={[0, 0.16, 0]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            background: "rgba(4,10,19,0.78)",
            color: "#d1fae5",
            border: "1px solid rgba(52, 211, 153, 0.22)",
            fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: "nowrap"
          }}
        >
          {signal.message}
        </div>
      </Html>
    </mesh>
  );
}

export function SignalParticles({ signals }: { signals: AgentSignal[] }) {
  return (
    <>
      {signals.slice(0, 12).map((signal) => (
        <SignalDot key={signal._id} signal={signal} />
      ))}
    </>
  );
}
