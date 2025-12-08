import React, { useState } from "react";
import { PlayingCard } from "./PlayingCard";

export const HandStrip = ({
  hand,
  onCardClick,
  selectedIndex,
  highlightIndex,
  onReorder,
}) => {
  const [draggedIndex, setDraggedIndex] = useState(null);
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
  let touchStart = null;

  const handleTouchStart = (e, index) => {
    const t = e.touches[0];
    touchStart = {
      index,
      x: t.clientX,
      y: t.clientY,
    };
    setDraggedIndex(index);
  };

  const handleTouchMove = (e) => {
    if (!touchStart) return;
    e.preventDefault(); // no scroll

    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);

    if (!el) return;

    const wrapper = el.closest("[data-card-index]");
    if (!wrapper) return;

    const targetIndex = Number(wrapper.dataset.cardIndex);
    if (targetIndex !== dropTargetIndex) {
      setDropTargetIndex(targetIndex);
    }
  };

  const handleTouchEnd = () => {
    if (touchStart != null && dropTargetIndex != null && dropTargetIndex !== touchStart.index) {
      const newHand = [...hand];
      const [c] = newHand.splice(touchStart.index, 1);
      newHand.splice(dropTargetIndex, 0, c);
      onReorder?.(newHand);
    }
    touchStart = null;
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
              ${draggedIndex === idx ? "opacity-40 scale-90" : ""}
              ${dropTargetIndex === idx ? "scale-110 ring-2 ring-amber-400" : ""}
            `}
          >
            <PlayingCard
              card={card}
              selected={selectedIndex === idx}
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
