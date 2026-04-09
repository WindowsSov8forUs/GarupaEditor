import { useCallback, useEffect, useState } from "react";

export function useSidebarResizeState(params: any) {
  const {
    workspaceRef,
    sidebarResizeRef,
    clamp,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH,
    WORKSPACE_DIVIDER_WIDTH,
    EDITOR_MIN_WIDTH,
  } = params;

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);

  const getSidebarResizeBounds = useCallback(() => {
    const workspaceWidth = workspaceRef.current?.clientWidth ?? Math.max(0, window.innerWidth - 28);
    const maxByEditor = Math.floor(workspaceWidth - WORKSPACE_DIVIDER_WIDTH - EDITOR_MIN_WIDTH);
    const minWidth = SIDEBAR_MIN_WIDTH;
    const maxWidth = Math.max(minWidth, Math.min(SIDEBAR_MAX_WIDTH, maxByEditor));
    return { minWidth, maxWidth };
  }, [EDITOR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, WORKSPACE_DIVIDER_WIDTH, workspaceRef]);

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const resize = sidebarResizeRef.current;
      if (!resize) {
        return;
      }

      const { minWidth, maxWidth } = getSidebarResizeBounds();
      const nextWidth = Math.round(clamp(resize.startWidth + (event.clientX - resize.startX), minWidth, maxWidth));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      if (!sidebarResizeRef.current) {
        return;
      }
      sidebarResizeRef.current = null;
      document.body.classList.remove("is-resizing-layout");
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [clamp, getSidebarResizeBounds, sidebarResizeRef]);

  useEffect(() => {
    const clampSidebarWidth = () => {
      const { minWidth, maxWidth } = getSidebarResizeBounds();
      setSidebarWidth((previous: number) => {
        const next = Math.round(clamp(previous, minWidth, maxWidth));
        return next === previous ? previous : next;
      });
    };

    clampSidebarWidth();
    window.addEventListener("resize", clampSidebarWidth);
    return () => window.removeEventListener("resize", clampSidebarWidth);
  }, [clamp, getSidebarResizeBounds]);

  return {
    sidebarWidth,
    getSidebarResizeBounds,
  };
}
