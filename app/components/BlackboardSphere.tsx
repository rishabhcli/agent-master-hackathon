"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

export function BlackboardSphere({ isActive }: { isActive: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += 0.004;
    const scale = 1 + Math.sin(state.clock.elapsedTime * 1.5) * (isActive ? 0.08 : 0.03);
    meshRef.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={meshRef} position={[0, 0.4, 0]}>
      <icosahedronGeometry args={[0.8, 1]} />
      <meshStandardMaterial
        color="#22d3ee"
        emissive="#0f766e"
        emissiveIntensity={isActive ? 1.2 : 0.5}
        roughness={0.2}
        metalness={0.45}
      />
    </mesh>
  );
}
