import { useEffect } from "react";

export function useEditorPointerLifecycle(params: any) {
  const {
    slideBuildRef,
    showDialog,
    releaseSlideConnection,
    slidePressRef,
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
      // A Slide tool press dragged elsewhere connects to where it is released.
      if ((slideBuildRef.current || slidePressRef.current?.hiddenId) && event.button === 0) {
        releaseSlideConnection(event.clientX, event.clientY);
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
          applySelectedOffset(delta.laneDelta, delta.beatDelta, {
            quantizeBeatDelta: false,
          });
        }
      }

      finishSelectionDrag(event.clientX, event.clientY);
    };

    // A suppressed click belongs to the press that set it. Some releases are never followed by a
    // click (a right-click ending a Slide build, a drag released off the board), so a new primary
    // press drops whatever suppression is left; handlers of that press may still set it again.
    const handleWindowMouseDown = (event: globalThis.MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      suppressNextBoardClickRef.current = false;
      suppressNextNoteClickRef.current = false;
    };

    window.addEventListener("mousedown", handleWindowMouseDown, true);
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousedown", handleWindowMouseDown, true);
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [applySelectedOffset, calcSelectionMoveDelta, finishSelectionDrag, releaseSlideConnection, slidePressRef, selectionMoveRef, setCursorPreview, setSelectionMovePreview, showDialog, slideBuildRef, suppressNextBoardClickRef, suppressNextNoteClickRef]);
}

