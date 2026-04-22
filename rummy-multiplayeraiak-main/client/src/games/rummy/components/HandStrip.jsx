import React, { useState } from "react";
import PlayingCard from "./PlayingCard";

export const HandStrip = ({
  hand,
  onCardClick,
  selectedIndex,
  highlightIndex,
  onReorder,
  draggedIndexExternal,
  setDraggedIndexExternal,
  onExternalDrop,
}) => {
  const [draggedIndexLocal, setDraggedIndexLocal] = useState(null);
  const transparentDragImageRef = React.useRef(null);
  const cardRenderKeys = React.useMemo(() => {
    const occurrences = new Map();
    return (hand || []).map((card) => {
      const base = `${String(card?.rank)}-${String(card?.suit || "null")}-${card?.joker ? "1" : "0"}`;
      const seen = occurrences.get(base) || 0;
      occurrences.set(base, seen + 1);
      return `${base}-${seen}`;
    });
  }, [hand]);

  // Use external state if strictly managed, or sync local
  const draggedIndex = draggedIndexExternal !== undefined ? draggedIndexExternal : draggedIndexLocal;

  const setDraggedIndex = (val) => {
    setDraggedIndexLocal(val);
    if (setDraggedIndexExternal) setDraggedIndexExternal(val);
  };
  const [dropTargetIndex, setDropTargetIndex] = useState(null);

  // -------------------------
  // DESKTOP DRAG
  // -------------------------
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);

    const card = hand[index];
    e.dataTransfer.setData("card", JSON.stringify(card));
    e.dataTransfer.setData("text/plain", `${index}`);
    e.dataTransfer.effectAllowed = "move";

    // Hide default browser drag preview (can incorrectly include multiple cards).
    if (transparentDragImageRef.current) {
      e.dataTransfer.setDragImage(transparentDragImageRef.current, 0, 0);
    }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex !== index) {
      setDropTargetIndex(index);
    }
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      endDrag();
      return;
    }

    if (!onReorder) {
      endDrag();
      return;
    }

    const newHand = [...hand];
    const [card] = newHand.splice(draggedIndex, 1);
    newHand.splice(dropIndex, 0, card);

    onReorder?.(newHand);
    endDrag();
  };

  const endDrag = () => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  };

  React.useEffect(() => {
    if (typeof document !== "undefined" && !transparentDragImageRef.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      transparentDragImageRef.current = c;
    }
  }, []);

  React.useEffect(() => {
    const hardStop = () => endDrag();
    window.addEventListener("mouseup", hardStop);
    window.addEventListener("touchend", hardStop);
    window.addEventListener("touchcancel", hardStop);
    window.addEventListener("blur", hardStop);
    document.addEventListener("visibilitychange", hardStop);
    return () => {
      window.removeEventListener("mouseup", hardStop);
      window.removeEventListener("touchend", hardStop);
      window.removeEventListener("touchcancel", hardStop);
      window.removeEventListener("blur", hardStop);
      document.removeEventListener("visibilitychange", hardStop);
    };
  }, []);

  React.useEffect(() => {
    if (draggedIndex != null && draggedIndex >= hand.length) {
      endDrag();
    }
  }, [draggedIndex, hand.length]);

  // -------------------------
  // MOBILE DRAG (FAST + FIXED)
  // -------------------------
  const touchStartRef = React.useRef(null);
  const externalDropRef = React.useRef(null); // track external target
  const autoScrollRafRef = React.useRef(null);
  /** When user is panning horizontally, let the overflow-x strip scroll (do not preventDefault). */
  const touchGestureRef = React.useRef("undecided"); // 'undecided' | 'scroll' | 'drag'

  const stopAutoScroll = React.useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const startAutoScroll = React.useCallback((direction) => {
    stopAutoScroll();
    const step = () => {
      window.scrollBy({ top: direction * 10, left: 0, behavior: "auto" });
      autoScrollRafRef.current = requestAnimationFrame(step);
    };
    autoScrollRafRef.current = requestAnimationFrame(step);
  }, [stopAutoScroll]);

  const handleTouchStart = (e, index) => {
    const t = e.touches[0];
    touchStartRef.current = {
      index,
      x: t.clientX,
      y: t.clientY,
    };
    externalDropRef.current = null;
    touchGestureRef.current = "undecided";
    setDraggedIndex(index);
  };

  /** Touch on strip only: gaps allow native horizontal scroll without card touch handlers blocking. */
  const handleStripTouchStart = (e) => {
    if (!e.touches?.length) return;
    const el = e.target;
    if (!(el instanceof Element)) {
      touchStartRef.current = null;
      touchGestureRef.current = "undecided";
      return;
    }
    const hit = el.closest("[data-card-index]");
    if (!hit) {
      touchStartRef.current = null;
      touchGestureRef.current = "undecided";
      return;
    }
    const idx = Number(hit.dataset.cardIndex);
    if (Number.isNaN(idx) || idx < 0 || idx >= (hand?.length ?? 0)) {
      touchStartRef.current = null;
      touchGestureRef.current = "undecided";
      return;
    }
    handleTouchStart(e, idx);
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return;

    const t = e.touches[0];
    const start = touchStartRef.current;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    if (touchGestureRef.current === "undecided") {
      if (ax > 10 && ax > ay) {
        touchGestureRef.current = "scroll";
        stopAutoScroll();
        touchStartRef.current = null;
        externalDropRef.current = null;
        setDropTargetIndex(null);
        endDrag();
        return;
      }
      if (ay > 10 && ay > ax * 1.12) {
        touchGestureRef.current = "drag";
      } else if (ax + ay < 8) {
        return;
      } else if (ax + ay > 22) {
        touchGestureRef.current = ax >= ay ? "scroll" : "drag";
        if (touchGestureRef.current === "scroll") {
          stopAutoScroll();
          touchStartRef.current = null;
          externalDropRef.current = null;
          setDropTargetIndex(null);
          endDrag();
          return;
        }
      } else {
        return;
      }
    }

    if (touchGestureRef.current === "scroll") {
      return;
    }

    if (touchGestureRef.current !== "drag") {
      return;
    }

    e.preventDefault();

    const topEdge = 120;
    const bottomEdge = window.innerHeight - 140;
    if (t.clientY < topEdge) startAutoScroll(-1);
    else if (t.clientY > bottomEdge) startAutoScroll(1);
    else stopAutoScroll();

    const el = document.elementFromPoint(t.clientX, t.clientY);

    if (!el) return;

    // Check for internal reorder target
    const wrapper = el.closest("[data-card-index]");
    if (wrapper) {
      const targetIndex = Number(wrapper.dataset.cardIndex);
      if (targetIndex !== dropTargetIndex) {
        setDropTargetIndex(targetIndex);
      }
      externalDropRef.current = null; // Clear external if back in hand
    } else {
      setDropTargetIndex(null); // Not over hand slot

      // Check for external drop zone
      const dropZone = el.closest("[data-drop-zone]");
      if (dropZone) {
        externalDropRef.current = dropZone.dataset.dropZone;
      } else {
        externalDropRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    stopAutoScroll();
    touchGestureRef.current = "undecided";
    const start = touchStartRef.current;

    // Check external drop first
    if (start != null && externalDropRef.current) {
      // Trigger external drop
      if (onExternalDrop) {
        onExternalDrop(start.index, externalDropRef.current);
      }
    }
    // Check internal reorder
    else if (onReorder && start != null && dropTargetIndex != null && dropTargetIndex !== start.index) {
      const newHand = [...hand];
      const [c] = newHand.splice(start.index, 1);
      newHand.splice(dropTargetIndex, 0, c);
      onReorder?.(newHand);
    }

    touchStartRef.current = null;
    externalDropRef.current = null;
    endDrag();
  };

  React.useEffect(() => {
    return () => stopAutoScroll();
  }, [stopAutoScroll]);

  return (
    <div
      className="hand-strip-scroll w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x"
      onTouchStart={handleStripTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="inline-flex gap-2 py-2 sm:py-4">
        {hand.map((card, idx) => (
          <div
            key={cardRenderKeys[idx] || `${card.rank}-${card.suit}-${idx}`}
            data-card-index={idx}
            draggable={!!(onReorder || onExternalDrop)}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={endDrag}
            className={`
              transition-all duration-200 relative
              ${draggedIndex === idx ? "opacity-20 scale-90" : ""}
              ${dropTargetIndex === idx ? "scale-110 ring-2 ring-amber-400" : ""}
            `}
          >
            <PlayingCard
              card={card}
              selected={selectedIndex === idx}
              draggable={false} // Disable inner drag so wrapper div handles it
              className="mobile-hand-card"
              onClick={onCardClick ? () => onCardClick(card, idx) : undefined}
            />

            {/* last drawn card highlight */}
            {highlightIndex === idx && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-ping" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
