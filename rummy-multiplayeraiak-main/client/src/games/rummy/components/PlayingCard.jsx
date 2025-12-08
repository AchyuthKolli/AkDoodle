// FINAL PlayingCard.jsx – supports mobile drag, joker, BACK cards, uppercase filenames
import React from "react";

export default function PlayingCard({
  card,
  onClick,
  selected = false,
  draggable = true,
  faceDown = false
}) {
  if (!card) return null;

  /* -----------------------------
     FACE DOWN CARD (Stock/Discard)
  --------------------------------*/
  if (faceDown || card.faceDown) {
    return (
      <img
        src="/cards/BACK.png"
        alt="back"
        draggable={false}
        className="w-[70px] sm:w-[88px] aspect-[2/3] rounded-lg shadow-md"
      />
    );
  }

  /* -----------------------------
     JOKERS (printed or wild)
  --------------------------------*/
  if (card.joker || card.rank === "JOKER") {
    const file = "/cards/JOKER_RED.png"; // default red joker (matches your assets)

    return (
      <img
        src={file}
        alt="joker"
        draggable={draggable}
        onClick={onClick}
        onDragStart={(e) => {
          if (!draggable) return;
          e.dataTransfer.setData("card", JSON.stringify(card));
        }}
        onTouchStart={(e) => {
          if (!draggable) return;
          e.target.dataset.card = JSON.stringify(card);
        }}
        className={`w-[70px] sm:w-[88px] aspect-[2/3] rounded-lg shadow-xl border
          ${selected ? "ring-2 ring-amber-400 scale-105" : ""}
        `}
      />
    );
  }

  /* -----------------------------
     NORMAL CARDS
  --------------------------------*/
  const rank = card.rank.toString().toUpperCase();
  const suit = (card.suit || "").toUpperCase();

  const filename = `${rank}${suit}.png`; // H10.png, CA.png, SQ.png etc.
  const src = `/cards/${filename}`;

  const fallback = (e) => {
    console.error("Missing card image:", filename);
    e.currentTarget.style.opacity = 0.3;
    e.currentTarget.style.border = "1px solid red";
  };

  return (
    <img
      src={src}
      alt={filename}
      draggable={draggable}
      onClick={onClick}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.setData("card", JSON.stringify(card));
      }}
      onTouchStart={(e) => {
        if (!draggable) return;
        e.target.dataset.card = JSON.stringify(card);
      }}
      onError={fallback}
      className={`
        w-[70px] sm:w-[88px]
        aspect-[2/3]
        rounded-lg
        shadow-xl
        border border-gray-300
        select-none
        transition-all duration-75
        ${selected ? "ring-2 ring-amber-400 scale-105" : ""}
      `}
    />
  );
}
