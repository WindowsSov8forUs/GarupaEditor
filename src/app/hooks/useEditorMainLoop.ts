import { useEffect, useRef } from "react";

export type EditorMainLoopFrame = {
  frame: number;
  nowMs: number;
  deltaMs: number;
  elapsedMs: number;
};

/**
 * Work run at the start of each editor frame, before the board is drawn: what moves the view (a smooth scroll) moves
 * it here, so the frame is drawn where the view now is.
 */
export const editorBeforeFrame = new Set<(deltaMs: number) => void>();

export function useEditorMainLoop(params: {
  enabled: boolean;
  onFrame: (frame: EditorMainLoopFrame) => void;
}) {
  const { enabled, onFrame } = params;
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let frame = 0;
    let animationHandle = 0;
    let startMs = performance.now();
    let previousMs = startMs;

    const tick = (nowMs: number) => {
      const deltaMs = Math.min(100, Math.max(0, nowMs - previousMs));
      previousMs = nowMs;
      frame += 1;
      for (const work of [...editorBeforeFrame]) work(deltaMs);
      onFrameRef.current({
        frame,
        nowMs,
        deltaMs,
        elapsedMs: nowMs - startMs,
      });
      animationHandle = requestAnimationFrame(tick);
    };

    animationHandle = requestAnimationFrame((nowMs) => {
      startMs = nowMs;
      previousMs = nowMs;
      tick(nowMs);
    });

    return () => {
      cancelAnimationFrame(animationHandle);
    };
  }, [enabled]);
}

