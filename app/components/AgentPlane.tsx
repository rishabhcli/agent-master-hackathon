"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface AgentPlaneProps {
  position: [number, number, number];
  rotation: [number, number, number];
  agentName: string;
  agentColor: string;
  agentRole: string;
  agentId: number;
  status: string;
  liveUrl: string | null;
  isActive: boolean;
}

export function AgentPlane({
  position,
  rotation,
  agentName,
  agentColor,
  agentRole,
  agentId,
  status,
  liveUrl,
  isActive
}: AgentPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const borderColor = useMemo(() => new THREE.Color(agentColor), [agentColor]);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.65 + position[0]) * 0.05;
    if (glowRef.current) {
      const scale = isActive ? 1.04 + Math.sin(state.clock.elapsedTime * 2.2) * 0.02 : 1.02;
      glowRef.current.scale.set(scale, scale, 1);
    }
  });

  return (
    <group position={position} rotation={rotation}>
      <mesh ref={glowRef} position={[0, 0, -0.02]}>
        <planeGeometry args={[2.28, 1.46]} />
        <meshBasicMaterial color={borderColor} transparent opacity={isActive ? 0.22 : 0.08} />
      </mesh>

      <mesh ref={meshRef}>
        <planeGeometry args={[2.2, 1.38]} />
        <meshStandardMaterial color="#0b1220" emissive={agentColor} emissiveIntensity={0.08} roughness={0.32} metalness={0.18} />
      </mesh>

      <Html transform position={[0, 0, 0.02]} scale={0.29} distanceFactor={3.5} style={{ pointerEvents: "none" }}>
        <div
          style={{
            width: 720,
            height: 450,
            overflow: "hidden",
            borderRadius: 12,
            background: "#091120",
            border: `1px solid ${agentColor}22`,
            display: "grid",
            gridTemplateRows: "1fr auto"
          }}
        >
          <div style={{ position: "relative", background: "#020408" }}>
            {liveUrl ? (
              <iframe
                src={liveUrl}
                title={`Agent ${agentId} local stream`}
                style={{ width: "100%", height: "100%", border: 0, pointerEvents: "none", background: "#020408" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  color: "#94a3b8",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  letterSpacing: 1.5,
                  textTransform: "uppercase"
                }}
              >
                Waiting for local preview
              </div>
            )}
          </div>
          <div style={{ padding: "10px 14px", display: "grid", gap: 4, background: "rgba(3, 7, 18, 0.94)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ color: agentColor, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" }}>{agentName}</div>
              <div style={{ color: "#94a3b8", fontSize: 10 }}>{status}</div>
            </div>
            <div style={{ color: "#64748b", fontSize: 10 }}>{agentRole}</div>
          </div>
        </div>
      </Html>
    </group>
  );
}
