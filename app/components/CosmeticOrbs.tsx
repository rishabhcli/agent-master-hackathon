"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export function CosmeticOrbs({ isActive }: { isActive: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    for (let index = 0; index < 40; index += 1) {
      const t = state.clock.elapsedTime * 0.12 + index * 0.16;
      dummy.position.set(Math.sin(t) * (5 + (index % 5) * 0.4), 1.8 + Math.cos(t * 1.8) * 0.8, Math.cos(t) * (5 + (index % 7) * 0.36));
      dummy.scale.setScalar(isActive ? 0.04 : 0.025);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(index, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 40]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={isActive ? "#38bdf8" : "#334155"} transparent opacity={0.22} />
    </instancedMesh>
  );
}
