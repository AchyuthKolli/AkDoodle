import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTableSocket } from "../../../../../apiclient/socket";
import PlayingCard from "./PlayingCard";
import "./meldboard.css";

/**
 * Final MeldBoard (Option-B)
 * - 3/3/3/4
 * - Orange lock (freeze meld)
 * - Green lock (pure sequence → reveal wild)
 * - Mobile drag/drop support
 * - LocalStorage persistence
 */
export default function MeldBoard({ tableId, userId, hand, onMeldChange }) {
  const socket = useTableSocket();

  const [melds, setMelds] = useState([[], [], [], []]);
  const [locked, setLocked] = useState([false, false, false, false]);
  const [sequenceLocked, setSequenceLocked] = useState(false);

  /* --------------------------------------------------
     Load saved state
  ---------------------------------------------------*/
  useEffect(() => {
    try {
      const m = localStorage.getItem(`melds_${tableId}_${userId}`);
      const l = localStorage.getItem(`locks_${tableId}_${userId}`);
      const seq = localStorage.getItem(`seqLock_${tableId}_${userId}`);

      if (m) setMelds(JSON.parse(m));
      if (l) setLocked(JSON.parse(l));
      if (seq === "true") setSequenceLocked(true);
    } catch {}
  }, []);

  const saveLS = (m, l, seq) => {
    try {
      localStorage.setItem(`melds_${tableId}_${userId}`, JSON.stringify(m));
      localStorage.setItem(`locks_${tableId}_${userId}`, JSON.stringify(l));
      localStorage.setItem(`seqLock_${tableId}_${userId}`, seq ? "true" : "false");
    } catch {}
  };

  /* --------------------------------------------------
     DROP HANDLER (desktop + mobile)
  ---------------------------------------------------*/
  function onDropCard(card, boxIndex) {
    if (locked[boxIndex]) {
      toast.error("This meld is locked.");
      return;
    }

    const limit = boxIndex === 3 ? 4 : 3;

    const m = JSON.parse(JSON.stringify(melds)); // deep copy

    if (m[boxIndex].length >= limit) {
      toast.error(`Meld ${boxIndex + 1} can only hold ${limit} cards`);
      return;
    }

    // Remove from all melds
    for (let i = 0; i < 4; i++) {
      m[i] = m[i].filter(
        (c) =>
          !(
            c.rank === card.rank &&
            c.suit === card.suit &&
            c.joker === card.joker
          )
      );
    }

    // Add to target
    m[boxIndex].push(card);

    setMelds(m);
    saveLS(m, locked, sequenceLocked);
    onMeldChange(m);
  }

  /* --------------------------------------------------
      ORANGE LOCK
  ---------------------------------------------------*/
  function lockSingle(index) {
    const limit = index === 3 ? 4 : 3;

    if (melds[index].length !== limit) {
      toast.error(`Meld ${index + 1} must have ${limit} cards`);
      return;
    }

    const l = [...locked];
    l[index] = true;

    setLocked(l);
    saveLS(melds, l, sequenceLocked);

    toast.success(`Meld ${index + 1} locked`);
  }

  /* --------------------------------------------------
      GREEN LOCK (Reveal Wild Joker)
  ---------------------------------------------------*/
  function lockPureSeq() {
    if (sequenceLocked) return;

    // simple requirement: any meld with >= 3 cards
    const hasSeq = melds.some((g) => g.length >= 3);

    if (!hasSeq) {
      toast.error("Add a pure sequence first.");
      return;
    }

    setSequenceLocked(true);
    saveLS(melds, locked, true);

    socket.emit("rummy.lockSequence", {
      tableId,
      userId,
      meld: melds[0],
    });

    toast.success("Pure sequence locked — Wild Joker revealed!");
  }

  /* --------------------------------------------------
      LEFTOVER (cards still in hand)
  ---------------------------------------------------*/
  const placed = new Set(
    melds.flat().map((c) => `${c.rank}${c.suit}${c.joker}`)
  );

  const leftover = hand.filter(
    (c) => !placed.has(`${c.rank}${c.suit}${c.joker}`)
  );

  /* --------------------------------------------------
      Render a single meld box
  ---------------------------------------------------*/
  const renderMeld = (meld, index) => {
    const size = index === 3 ? 4 : 3;

    return (
      <div className="meld-box">
        <div className="meld-header">
          <span>Meld {index + 1} ({size})</span>
          <button
            className={`lock-btn ${locked[index] ? "locked" : ""}`}
            onClick={() => lockSingle(index)}
            disabled={locked[index]}
          >
            {locked[index] ? "🔒" : "🔓"}
          </button>
        </div>

        <div className="meld-cards">
          {Array(size)
            .fill(null)
            .map((_, i) => (
              <div
                key={i}
                className="meld-slot"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const card = JSON.parse(e.dataTransfer.getData("card"));
                  onDropCard(card, index);
                }}
                onTouchEnd={(e) => {
                  // mobile drop logic
                  const json = e.target.dataset.card;
                  if (!json) return;
                  const card = JSON.parse(json);
                  onDropCard(card, index);
                }}
              >
                {meld[i] ? (
                  <PlayingCard card={meld[i]} draggable={false} small />
                ) : (
                  <div className="empty-slot">{i + 1}</div>
                )}
              </div>
            ))}
        </div>
      </div>
    );
  };

  /* --------------------------------------------------
      FINAL UI
  ---------------------------------------------------*/
  return (
    <div className="meld-board-container">
      <div className="meld-row">
        {renderMeld(melds[0], 0)}
        {renderMeld(melds[1], 1)}
        {renderMeld(melds[2], 2)}
      </div>

      <div className="meld-row">{renderMeld(melds[3], 3)}</div>

      <div className="leftover-box">
        <div className="leftover-header">
          Leftover / 4-Card Seq
          <button
            className={`seq-lock-btn ${sequenceLocked ? "on" : ""}`}
            onClick={lockPureSeq}
            disabled={sequenceLocked}
          >
            {sequenceLocked ? "🟢 Pure Locked" : "🟩 Lock Pure Seq"}
          </button>
        </div>

        <div className="leftover-cards">
          {leftover.map((c, i) => (
            <PlayingCard
              key={i}
              card={c}
              draggable={true}
              small
              onDragStart={(e) =>
                e.dataTransfer.setData("card", JSON.stringify(c))
              }
              onTouchStart={(e) => {
                e.target.dataset.card = JSON.stringify(c);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
