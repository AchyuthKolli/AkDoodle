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
    e.dataTransfer.effectAllowed = "move";

    // Hide ghost image
    const img = new Image();
    img.src = "";
    e.dataTransfer.setDragImage(img, 0, 0);
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

  // -------------------------
  // MOBILE DRAG (FAST + FIXED)
  // -------------------------
  const touchStartRef = React.useRef(null);
  const externalDropRef = React.useRef(null); // track external target

  const handleTouchStart = (e, index) => {
    const t = e.touches[0];
    touchStartRef.current = {
      index,
      x: t.clientX,
      y: t.clientY,
    };
    externalDropRef.current = null;
    setDraggedIndex(index);
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return;

    // Allow small scroll? Or prevent default to drag? 
    // Usually strict drag needs preventDefault.
    e.preventDefault();

    const t = e.touches[0];
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
    const start = touchStartRef.current;

    // Check external drop first
    if (start != null && externalDropRef.current) {
      // Trigger external drop
      if (onExternalDrop) {
        onExternalDrop(start.index, externalDropRef.current);
      }
    }
    // Check internal reorder
    else if (start != null && dropTargetIndex != null && dropTargetIndex !== start.index) {
      const newHand = [...hand];
      const [c] = newHand.splice(start.index, 1);
      newHand.splice(dropTargetIndex, 0, c);
      onReorder?.(newHand);
    }

    touchStartRef.current = null;
    externalDropRef.current = null;
    endDrag();
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-2 py-4">
        {hand.map((card, idx) => (
          <div
            key={`${card.rank}-${card.suit}-${idx}`}
            data-card-index={idx}
            draggable={!!onReorder}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={endDrag}
            onTouchStart={(e) => handleTouchStart(e, idx)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`
              transition-all duration-200 relative
              ${draggedIndex === idx ? "opacity-20 scale-90 pointer-events-none" : ""}
              ${dropTargetIndex === idx ? "scale-110 ring-2 ring-amber-400" : ""}
            `}
          >
            <PlayingCard
              card={card}
              selected={selectedIndex === idx}
              draggable={false} // Disable inner drag so wrapper div handles it
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
