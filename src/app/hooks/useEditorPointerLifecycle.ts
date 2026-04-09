import { useEffect } from "react";

export function useEditorPointerLifecycle(params: any) {
  const {
    slideBuildRef,
    setSlideBuildState,
    setStatusMessage,
    finalizeSlideBuild,
    selectionMoveRef,
    calcSelectionMoveDelta,
    setSelectionMovePreview,
    setCursorPreview,
    suppressNextBoardClickRef,
    suppressNextNoteClickRef,
    applySelectedOffset,
    finishSelectionDrag,
  } = params;

  useEffect(() => {
    const handleWindowMouseMove = (event: globalThis.MouseEvent) => {
      const drag = selectionMoveRef.current;
      if (!drag) {
        return;
      }

      const delta = calcSelectionMoveDelta(event.clientX, event.clientY);
      if (!delta) {
        return;
      }

      drag.isDragging = delta.moved;
      setSelectionMovePreview((previous: any) => {
        if (
          previous &&
          previous.laneDelta === delta.laneDelta &&
          Math.abs(previous.beatDelta - delta.beatDelta) < 1e-6 &&
          previous.isDragging === delta.moved
        ) {
          return previous;
        }
        return {
          laneDelta: delta.laneDelta,
          beatDelta: delta.beatDelta,
          isDragging: delta.moved,
        };
      });
      if (delta.moved) {
        setCursorPreview(null);
      }
    };

    const handleWindowMouseUp = (event: globalThis.MouseEvent) => {
      const activeSlideBuild = slideBuildRef.current;
      if (activeSlideBuild && event.button === 0) {
        if (activeSlideBuild.persistUntilRightClick) {
          if (activeSlideBuild.mode === "drag") {
            setSlideBuildState((previous: any) => {
              if (!previous || previous.mode === "append") {
                slideBuildRef.current = previous;
                return previous;
              }
              const next = {
                ...previous,
                mode: "append",
              };
              slideBuildRef.current = next;
              return next;
            });
            setStatusMessage("Slide 创建中：左键空白追加节点，左键音符进入拖动连接，右键完成。");
          }
          return;
        }
        finalizeSlideBuild();
        return;
      }

      const drag = selectionMoveRef.current;
      if (drag) {
        const delta = calcSelectionMoveDelta(event.clientX, event.clientY);
        selectionMoveRef.current = null;
        setSelectionMovePreview(null);

        if (delta?.moved) {
          suppressNextBoardClickRef.current = true;
          suppressNextNoteClickRef.current = true;
          applySelectedOffset(delta.laneDelta, delta.beatDelta, "已拖拽移动选中音符。", {
            quantizeBeatDelta: false,
          });
        }
      }

      finishSelectionDrag(event.clientX, event.clientY);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [applySelectedOffset, calcSelectionMoveDelta, finalizeSlideBuild, finishSelectionDrag, selectionMoveRef, setCursorPreview, setSelectionMovePreview, setSlideBuildState, setStatusMessage, slideBuildRef, suppressNextBoardClickRef, suppressNextNoteClickRef]);
}

