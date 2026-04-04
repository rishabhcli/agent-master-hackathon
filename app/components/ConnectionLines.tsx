"use client";

import { Line } from "@react-three/drei";
import { AGENTS } from "../hooks/useAgentData";

export function ConnectionLines({ isActive }: { isActive: boolean }) {
  return (
    <>
      {AGENTS.map((_, index) => {
        const angle = (index / AGENTS.length) * Math.PI * 2;
        const x = Math.sin(angle) * 4.2;
        const z = Math.cos(angle) * 4.2;
        return (
          <Line
            key={`line-${index + 1}`}
            points={[
              [0, 0.4, 0],
              [x, 0.15, z]
            ]}
            color={isActive ? "#155e75" : "#1e293b"}
            lineWidth={1}
            transparent
            opacity={isActive ? 0.5 : 0.18}
          />
        );
      })}
    </>
  );
}
