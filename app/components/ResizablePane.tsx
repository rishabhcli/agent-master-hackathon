"use client";

import { useCallback, useState } from "react";

interface ResizablePaneProps {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  left: React.ReactNode;
  right: React.ReactNode;
}

export function ResizablePane({ defaultWidth, minWidth, maxWidth, left, right }: ResizablePaneProps) {
  const [width, setWidth] = useState(defaultWidth);

  const startDrag = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      const onMove = (moveEvent: MouseEvent) => {
        setWidth((current) => {
          const next = current + moveEvent.movementX;
          return Math.min(maxWidth, Math.max(minWidth, next));
        });
      };

      const stop = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", stop);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", stop);
    },
    [maxWidth, minWidth]
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: `${width}px 10px 1fr`, width: "100%", height: "100%" }}>
      <div style={{ position: "relative", overflow: "hidden", borderRight: "1px solid rgba(79, 94, 117, 0.18)" }}>
        {left}
      </div>
      <div
        onMouseDown={startDrag}
        style={{
          cursor: "col-resize",
          background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(8, 145, 178, 0.18) 50%, rgba(0,0,0,0) 100%)"
        }}
      />
      <div style={{ position: "relative", overflow: "hidden" }}>{right}</div>
    </div>
  );
}
