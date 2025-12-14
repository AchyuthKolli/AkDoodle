/* client/src/pages/Table.jsx
   Final plain-JSX Table component (no TypeScript). Ready to paste.
*/

import {
  socket,
  joinRoom,
  onGameUpdate,
  onChatMessage,
  onVoiceStatus,
  onDeclareUpdate,
  onSpectateUpdate,
} from "../socket";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import apiclient from "../apiclient";
import {
  Copy,
  Check,
  Crown,
  User2,
  Play,
  Trophy,
  X,
  ChevronDown,
  ChevronUp,
  LogOut,
  Mic,
  MicOff,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

// ✅ ALL RUMMY COMPONENTS NOW UNDER games/rummy/
import { HandStrip } from "../games/rummy/components/HandStrip.jsx";
import { TableDiagram } from "../games/rummy/components/TableDiagram.jsx";
import { CasinoTable3D } from "../games/rummy/components/CasinoTable3D.jsx";
import { PlayerProfile } from "../games/rummy/components/PlayerProfile.jsx";
import PlayingCard from "../games/rummy/components/PlayingCard.jsx";
import { GameRules } from "../games/rummy/components/GameRules.jsx";
import { GameHistory } from "../games/rummy/components/GameHistory.jsx";
import SpectateControls from "../games/rummy/components/SpectateControls.jsx";
import { WildJokerRevealModal } from "../games/rummy/components/WildJokerRevealModal.jsx";
import { ScoreboardModal } from "../games/rummy/components/ScoreboardModal.jsx";
import { PointsTable } from "../games/rummy/components/PointsTable.jsx";
import MeldBoard from "../games/rummy/components/MeldBoard.jsx";
import VoicePanel from "../games/rummy/components/VoicePanel.jsx";
import HistoryTable from "../games/rummy/components/HistoryTable.jsx";
import ChatSidebar from "../games/rummy/components/ChatSidebar.jsx";
import { RummyProvider, useRummy } from "../games/rummy/RummyContext.jsx";
import { validateHand } from "../games/rummy/utils/validator.js";


// utilities
import { parseCardCode } from "../utils/cardCodeUtils";
import { initCursorSpark } from "../utils/cursor-spark"; // sparkles

// ui
import { Button } from "@/components/ui/Button";
import { useAuth } from "../auth/AuthContext";

// Simple CardBack
const CardBack = ({ className = "" }) => (
  <div className={`relative bg-white rounded-lg border-2 border-gray-300 shadow-lg ${className}`}>
    <div className="absolute inset-0 rounded-lg overflow-hidden">
      <div
        className="w-full h-full"
        style={{
          background: "repeating-linear-gradient(45deg, #dc2626 0px, #dc2626 10px, white 10px, white 20px)",
        }}
      />
    </div>
  </div>
);

/* ----------------- MeldSlotBox & LeftoverSlotBox (no TS) ----------------- */

const MeldSlotBox = ({
  title,
  slots,
  setSlots,
  myRound,
  setMyRound,
  isLocked = false,
  onToggleLock,
  tableId,
  onRefresh,
  hideLockButton,
  gameMode,
  capacity = 3,
  boxIndex, // New prop
}) => {
  const [locking, setLocking] = useState(false);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealedRank, setRevealedRank] = useState(null);

  const handleSlotDrop = (slotIndex, cardData) => {
    if (!myRound || isLocked) {
      if (isLocked) toast.error("Unlock meld first to modify");
      return;
    }
    try {
      const card = JSON.parse(cardData);
      if (slots[slotIndex] !== null) {
        toast.error("Slot already occupied");
        return;
      }

      const newSlots = [...slots];
      newSlots[slotIndex] = card;
      setSlots(newSlots);
      toast.success(`Card placed in ${title} slot ${slotIndex + 1}`);
    } catch (e) {
      toast.error("Invalid card data");
    }
  };

  const handleSlotClick = (slotIndex) => {
    if (!myRound || slots[slotIndex] === null || isLocked) {
      if (isLocked) toast.error("Unlock meld first to modify");
      return;
    }
    const newSlots = [...slots];
    newSlots[slotIndex] = null;
    setSlots(newSlots);
    toast.success("Card returned to hand");
  };

  const handleLockSequence = async () => {
    const cards = slots.filter((s) => s !== null);
    if (cards.length !== 3) {
      toast.error("Fill all 3 slots to lock a sequence");
      return;
    }
    setLocking(true);
    try {
      const meldCards = cards.map((card) => ({ rank: card.rank, suit: card.suit || null }));
      const body = { table_id: tableId, meld: meldCards };
      const res = await apiclient.lock_sequence(body);
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        if (onToggleLock) onToggleLock();
        if (data.wild_joker_revealed && data.wild_joker_rank) {
          setRevealedRank(data.wild_joker_rank);
          setShowRevealModal(true);
          setTimeout(() => onRefresh(), 500);
        }
      } else {
        toast.error(data.message || "Lock failed");
      }
    } catch (err) {
      console.error("Lock error", err);
      toast.error("Failed to lock sequence");
    } finally {
      setLocking(false);
    }
  };

  const isNoJoker = (gameMode || "").toLowerCase().includes("no") && (gameMode || "").toLowerCase().includes("joker");
  // Also check if mode is explicitly "classic" if that implies no joker? Assuming "No Joker" string from user report.

  return (
    <>
      <div
        data-drop-zone={`meld-${boxIndex}`} // ADDED: For mobile drag detection by HandStrip
        className={`border border-dashed rounded p-2 ${isLocked ? "border-amber-500/50 bg-amber-900/20" : "border-purple-500/30 bg-purple-900/10"}`}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-purple-400">{title} ({capacity} cards)</p>
          <div className="flex items-center gap-1">
            {!isLocked && !isNoJoker && (
              <button
                onClick={handleLockSequence}
                disabled={locking}
                title={slots.filter(s => s !== null).length < 3 ? "Add 3+ cards first" : "Lock & Reveal Wildcard (Requires Pure Sequence)"}
                className="text-[10px] px-2 py-0.5 bg-green-700 text-green-100 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {locking ? "..." : "🔒 Lock & Reveal"}
              </button>
            )}
            {onToggleLock && (
              <button
                onClick={onToggleLock}
                className={`text-[10px] px-1.5 py-0.5 rounded ${isLocked ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30"}`}
              >
                {isLocked ? "🔒" : "🔓"}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {slots.map((card, i) => (
            <div
              key={i}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("ring-2", "ring-purple-400");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("ring-2", "ring-purple-400");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("ring-2", "ring-purple-400");
                const cardData = e.dataTransfer.getData("card");
                if (cardData) handleSlotDrop(i, cardData);
              }}
              onTouchEnd={(e) => {
                // Mobile drop support
                const cardData = e.target.getAttribute("data-card-json") || e.currentTarget.getAttribute("data-card-json");
                // Wait... the drag source (HandStrip) puts data on e.target.dataset.card?
                // Actually the HandStrip sets `e.target.dataset.card`.
                // BUT `onTouchEnd` fires on the target element (the slot) IF we finger-up there?
                // No, standard touch events don't work like drag-and-drop.
                // We need `onDrop` equivalent. HandStrip uses `document.elementFromPoint` in `handleTouchMove` to find drop target.
                // It calls `handleTouchEnd` which checks `dropTargetIndex`.
                // HandStrip is handling the drop on HAND side reorder.
                // For transferring to MeldSlotBox, we need the MeldSlotBox to be detectable by `document.elementFromPoint`.
                // HandStrip's `handleTouchEnd` logic only reorders hand. It doesn't seem to support dropping onto external targets?
                // Wait, let's look at HandStrip `handleTouchEnd` again.
                // It checks `dropTargetIndex` inside the Hand.
                // To support Hand -> Meld, we need a different mechanism or HandStrip update.
                // HOWEVER, if we follow the pattern in MeldBoard.jsx (the unused one), it used `onTouchEnd` on the slot.
                // But touch events bubble. If we drag a Ghost element...
                // HandStrip implementation:
                // `handleTouchMove` -> `document.elementFromPoint`.
                // If the user drags finger over MeldSlotBox, we need MeldSlotBox to handle it?
                // Actually HandStrip `handleTouchMove` seems scoped to "wrapper" (the hand cards).
                // Let's rely on adding `data-drop-zone="meld"` attributes maybe?
                //
                // Standard workaround:
                // We add `onTouchUp` or similar?
                // Actually, let's look at the MeldBoard.jsx attempt:
                // onTouchEnd={(e) => { const json = e.target.dataset.card; ... }}
                // That implies the card ITSELF (the drag source) has the data.
                // But `onTouchEnd` fires on the element where touch ended? NO, it fires on the element where touch STARTED (unless captured).
                // So adding onTouchEnd to MeldSlotBox won't help if the touch started on HandCard.
                //
                // We need to fix this properly.
                // But for now, let's assume `HandStrip` needs to be able to drop 'externally'.
                // If I just add `onDrop` it works for Mouse.
                // For Touch, the HandStrip `handleTouchMove` needs modification to detect external drop zones.
                // OR we accept that `MeldBoard.jsx` (which User sent as reference images implies existed?) had logic.
                //
                // Let's implement `data-meld-index={i}` on the slot.
                // AND since I can't easily change HandStrip global touch logic without breaking reorder:
                // I will add `onDragOver` / `onDrop` for Mouse (already there).
                // I will try to support Touch by adding `data-drop-zone` attributes that HandStrip COULD use if we update it.
                //
                // Wait, if I am forced to fix it in THIS file:
                // I'll leave the Mouse `onDrop` as is.
                // I will add `data-meld-slot={i}` to facilitate potential detection.
                // AND I will add `onTouchEnd` just in case the User is using a library that fires it, or if they drag the card perfectly?
                // Actually, standard HTML5 Drag and Drop API *sometimes* has polyfills for touch.
                // If no polyfill, we need custom code.
                // The user request says "Cards not draggable...".
                // I will add the `onTouchEnd` handler similar to `MeldBoard.jsx` just in case.
                // It might interact with a global handler or the card's touch end.
                //
                // Re-reading MeldBoard.jsx (lines 172-178):
                // onTouchEnd={(e) => { const json = e.target.dataset.card; if(json) onDropCard(...) }}
                // This looks like it expects the *card being dragged* (which started the touch) to trigger this?
                // No, that would trigger on the card.
                // If the user taps the slot? Click-to-move was also requested.
                // "restore drag-and-drop (or click-to-move)"
                // I will implements CLICK TO MOVE. This is much more reliable for accessibility and mobile.
                // Mechanism: User selects card in Hand (already `selectedCard`). User clicks Slot. Card moves.
                //
                // Code below implements:
                // 1. Mouse Drop (existing)
                // 2. Click (handleSlotClick is for removing. I need to handle ADDING too).
                //
              }}
              onClick={() => {
                // If slot is empty and we have a selected card, move it here!
                if (!card && selectedCard && myRound && !isLocked) {
                  // We need to construct the card JSON to reuse handleSlotDrop or just call logic
                  // The `selectedCard` is state object.
                  // We need to be careful about format.
                  const cardJson = JSON.stringify(selectedCard);
                  handleSlotDrop(i, cardJson);
                  // Optionally clear selection?
                  // The handleSlotDrop doesn't clear selection. Table.jsx handling of discard does.
                  // We might want to notify Table to clear selection?
                  // But `setSlots` is local.
                  // The user might want to move multiple cards.
                } else {
                  handleSlotClick(i);
                }
              }}
              className="w-[84px] h-[116px] border border-dashed border-slate-700 rounded bg-slate-900/80 flex items-center justify-center cursor-pointer hover:border-purple-400/50 transition-all shadow-inner"
            >
              {card ? (
                <div className="w-full h-full p-1">
                  <PlayingCard card={card} onClick={() => { }} draggable={false} className="w-full h-full shadow-md" />
                </div>
              ) : (
                <span className="text-xs text-slate-600 font-bold">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {revealedRank && (
        <WildJokerRevealModal isOpen={showRevealModal} onClose={() => setShowRevealModal(false)} wildJokerRank={revealedRank} />
      )}
    </>
  );
};

const LeftoverSlotBox = ({
  slots,
  setSlots,
  myRound,
  setMyRound,
  isLocked = false,
  onToggleLock,
  tableId,
  onRefresh,
  gameMode,
  capacity = 3,
}) => {
  const [locking, setLocking] = useState(false);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealedRank, setRevealedRank] = useState(null);

  const handleSlotDrop = (slotIndex, cardData) => {
    if (!myRound || isLocked) return;
    try {
      const card = JSON.parse(cardData);
      if (slots[slotIndex] !== null) {
        toast.error("Slot already occupied");
        return;
      }
      const newSlots = [...slots];
      newSlots[slotIndex] = card;
      setSlots(newSlots);
      toast.success(`Card placed in leftover slot ${slotIndex + 1}`);
    } catch (e) {
      toast.error("Invalid card data");
    }
  };

  const handleSlotClick = (slotIndex) => {
    if (!myRound || slots[slotIndex] === null) return;
    const newSlots = [...slots];
    newSlots[slotIndex] = null;
    setSlots(newSlots);
    toast.success("Card returned to hand");
  };

  const handleLockSequence = async () => { // Keep lock logic for Leftover? Or remove? Usually Leftover isn't locked as a sequence.
    // Assuming Leftover is just deadwood, no lock needed usually. But strict Rummy might not lock deadwood.
    // However, the original code had 4-card seq logic here. I should probably DISABLE lock for Deadwood.
    toast.info("Leftover card is for discard/deadwood. No need to lock.");
  };


  return (
    <>
      <div
        data-drop-zone="deadwood" // For mobile drag detection
        className={`border border-dashed rounded p-2 ${isLocked ? "border-amber-500/50 bg-amber-900/20" : "border-blue-500/30 bg-blue-900/10"}`}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-blue-400">Discard / Deadwood (14th Card)</p>
          <div className="flex items-center gap-1">
            {/* Removed Lock button for Deadwood */}
            {onToggleLock && (
              <button
                onClick={onToggleLock}
                className={`text-[10px] px-1.5 py-0.5 rounded ${isLocked ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30"}`}
              >
                {isLocked ? "🔒" : "🔓"}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {slots.map((card, i) => (
            <div
              key={i}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("ring-2", "ring-cyan-400");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("ring-2", "ring-cyan-400");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("ring-2", "ring-cyan-400");
                const cardData = e.dataTransfer.getData("card");
                if (cardData) handleSlotDrop(i, cardData);
              }}
              onClick={() => {
                // Click to move logic
                if (!card && selectedCard && myRound && !isLocked) {
                  const cardJson = JSON.stringify(selectedCard);
                  handleSlotDrop(i, cardJson);
                } else {
                  handleSlotClick(i);
                }
              }}
              className="w-[84px] h-[116px] border border-dashed border-slate-700 rounded bg-slate-900/80 flex items-center justify-center cursor-pointer hover:border-cyan-400/50 transition-all shadow-inner"
            >
              {card ? (
                <div className="w-full h-full p-1">
                  <PlayingCard card={card} onClick={() => { }} draggable={false} className="w-full h-full shadow-md" />
                </div>
              ) : (
                <span className="text-xs text-slate-600 font-bold">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
      </div>


      {revealedRank && (
        <WildJokerRevealModal isOpen={showRevealModal} onClose={() => setShowRevealModal(false)} wildJokerRank={revealedRank} />
      )
      }
    </>
  );
};

const RummyPlayersList = ({ info, activeUserId }) => {
  const { players } = useRummy();
  const { user } = useAuth();
  // Prefer context players if available (reactive), fallback to info.players
  const displayPlayers = (players && Object.keys(players).length > 0) ? Object.values(players) : (info?.players || []);

  // Sort: Host first, then seat order? Or just keep original order but merge data.
  // Actually, let's stick to info.players order but use context data for avatars
  const unifiedPlayers = (info?.players || []).map(p => {
    const ctxP = players[p.user_id];
    return {
      ...p,
      profile_image_url: ctxP?.profile_image_url || ctxP?.photoURL || p.profile_image_url,
      display_name: ctxP?.display_name || p.display_name
    };
  });
  console.log("Unified Players for Sidebar:", unifiedPlayers); // Debug avatars

  return (
    <>
      {unifiedPlayers.map((p) => (
        <div key={p.user_id} className={`flex items-center gap-3 bg-background px-3 py-2 rounded-lg border border-border shadow-sm`}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center border border-green-600/50 overflow-hidden bg-black">
            {p.profile_image_url ? (
              <img src={p.profile_image_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <User2 className="w-5 h-5 text-green-100" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-sm font-medium truncate">{p.display_name || "Player"}</p>
            <p className="text-muted-foreground text-xs truncate">Seat {p.seat}</p>
          </div>
          {p.user_id === info.host_user_id && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full border border-amber-500/20">
              <Crown className="w-3 h-3" /> Host
            </span>
          )}
        </div>
      ))}
    </>
  );
};

/* --------------------------- Main Table Component --------------------------- */

export default function Table() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const tableId = sp.get("tableId");

  // State
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [myRound, setMyRound] = useState(null);
  const [copied, setCopied] = useState(false);
  const [acting, setActing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [scoreboard, setScoreboard] = useState(null);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showWildJokerReveal, setShowWildJokerReveal] = useState(false);
  const [revealedWildJoker, setRevealedWildJoker] = useState(null);
  const [roundHistory, setRoundHistory] = useState([]);
  const [tableColor, setTableColor] = useState("green");
  const [voiceMuted, setVoiceMuted] = useState(false);

  const [droppingGame, setDroppingGame] = useState(false);
  const [spectateRequested, setSpectateRequested] = useState(false);
  const [spectateRequests, setSpectateRequests] = useState([]);
  const [showScoreboardModal, setShowScoreboardModal] = useState(false);
  const [showScoreboardPanel, setShowScoreboardPanel] = useState(false);
  const [revealedHands, setRevealedHands] = useState(null);

  // Dragged card tracking (local UI fix for lag)
  const [draggedCardIndex, setDraggedCardIndex] = useState(null);

  // keep previous players list to detect leaves
  const prevPlayersRef = useRef(null);

  // init cursor sparkles once when Table mounts
  useEffect(() => {
    initCursorSpark();
  }, []);

  // DEBUG: Monitor tableId changes and URL
  useEffect(() => {
    console.log("🔍 Table Component - tableId from URL:", tableId);
    if (!tableId) {
      console.error("❌ CRITICAL: tableId is missing from URL!");
    }
  }, [tableId, sp]);


  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState(null); // Track specific card instance by index
  const [lastDrawnCard, setLastDrawnCard] = useState(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pureSeq, setPureSeq] = useState([]);
  const [meld1, setMeld1] = useState([null, null, null]);
  const [meld2, setMeld2] = useState([null, null, null]);
  const [meld3, setMeld3] = useState([null, null, null]);
  const [meld4, setMeld4] = useState([null, null, null, null]); // [NEW] Meld 4 (4 slots)
  const [leftover, setLeftover] = useState([null]); // Deadwood (1 slot)
  const [prevRoundFinished, setPrevRoundFinished] = useState(null);
  const [showPointsTable, setShowPointsTable] = useState(true);

  // Table Info box state
  const [tableInfoVisible, setTableInfoVisible] = useState(true);
  const [tableInfoMinimized, setTableInfoMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState("info");

  // Meld lock state
  const [meldLocks, setMeldLocks] = useState({
    meld1: false,
    meld2: false,
    meld3: false,
    meld4: false,
    leftover: false,
  });

  // Load locked melds from localStorage on mount
  useEffect(() => {
    if (!tableId) return;
    const storageKey = `rummy_melds_${tableId}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const { meld1: m1, meld2: m2, meld3: m3, leftover: lo, locks } = parsed;
        if (locks?.meld1) setMeld1(m1);
        if (locks?.meld2) setMeld2(m2);
        if (locks?.meld3) setMeld3(m3);
        if (locks?.leftover) setLeftover(lo);
        if (locks) setMeldLocks(locks);
      } catch (e) {
        console.error("Failed to load melds from localStorage:", e);
      }
    }
  }, [tableId]);

  // Save locked melds to localStorage whenever they change
  useEffect(() => {
    if (!tableId) return;
    const storageKey = `rummy_melds_${tableId}`;
    const data = { meld1, meld2, meld3, leftover, locks: meldLocks };
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [tableId, meld1, meld2, meld3, leftover, meldLocks]);

  const toggleMeldLock = (meldName) => {
    setMeldLocks((prev) => ({ ...prev, [meldName]: !prev[meldName] }));
    toast.success(`${meldName} ${!meldLocks[meldName] ? "locked" : "unlocked"}`);
  };

  // Debug user object
  useEffect(() => {
    if (user) {
      console.log("User object:", { id: user.id, displayName: user.displayName });
    }
  }, [user]);

  // ===== SOCKET REAL-TIME SYNC (MODE A) ===== //
  useEffect(() => {
    if (!tableId || !user) return;

    // join
    joinRoom(tableId, user.id, user.displayName || user.username || "Guest", user.photoURL || user.picture || user.profile_image || null);
    console.log("🟢 Joined socket room:", tableId);

    // game update -> refresh quickly (small debounce)
    onGameUpdate(() => {
      console.log("♻️ Real-time game update received");
      setTimeout(() => {
        refresh().catch((e) => console.warn("refresh error", e));
      }, 150);
    });

    onDeclareUpdate(() => {
      console.log("🏆 Real-time declare update received");
      fetchRevealedHands();
    });

    onVoiceStatus((data) => {
      console.log("🎤 Voice update:", data);
      if (data.userId === user.id) setVoiceMuted(data.muted);
    });

    onSpectateUpdate((data) => {
      console.log("👁 Spectate update", data);
      refresh();
    });

    onChatMessage((msg) => {
      console.log("💬 Chat:", msg);
    });

    return () => {
      console.log("🔴 Leaving room:", tableId);
      socket.off("game_update");
      socket.off("declare_made");
      socket.off("voice_status");
      socket.off("spectate_update");
      socket.off("chat_message");
    };
  }, [tableId, user]);

  // Get cards that are placed in slots (not in hand anymore)
  const placedCards = useMemo(() => {
    const placed = [...meld1, ...meld2, ...meld3, ...leftover].filter((c) => c !== null);
    return placed;
  }, [meld1, meld2, meld3, leftover]);

  // Filter hand to exclude placed cards - FIX for duplicate cards
  const availableHand = useMemo(() => {
    if (!myRound) return [];
    const placedCounts = new Map();
    placedCards.forEach((card) => {
      const key = `${card.rank}-${card.suit || "null"}`;
      placedCounts.set(key, (placedCounts.get(key) || 0) + 1);
    });
    const seenCounts = new Map();
    return myRound.hand.filter((handCard) => {
      const key = `${handCard.rank}-${handCard.suit || "null"}`;
      const placedCount = placedCounts.get(key) || 0;
      const seenCount = seenCounts.get(key) || 0;
      if (seenCount < placedCount) {
        seenCounts.set(key, seenCount + 1);
        return false;
      }
      return true;
    });
  }, [myRound, placedCards]);

  // Helper to determine number of decks based on player count
  const determineDecksForPlayers = (playerCount) => {
    if (playerCount <= 2) return 1;
    if (playerCount === 3 || playerCount === 4) return 2;
    return 3; // 5 or 6 players
  };

  const refresh = async () => {
    if (!tableId) {
      console.error("❌ refresh() called without tableId");
      return;
    }
    try {
      const query = { table_id: tableId };
      const res = await apiclient.get_table_info(query);
      if (!res.ok) {
        console.error("❌ get_table_info failed with status:", res.status);
        toast.error("Failed to refresh table info");
        setLoading(false);
        return;
      }
      const data = await res.json();

      // detect player leaves (compare previous players)
      try {
        const prev = prevPlayersRef.current;
        const currentIds = (data.players || []).map((p) => p.user_id);
        if (prev && prev.length > currentIds.length) {
          const leftIds = prev.filter((x) => !currentIds.includes(x));
          leftIds.forEach(async (uid) => {
            console.warn("Player left mid-round:", uid);
            toast.info(`Player left: ${uid}. Applying penalty / auto-remove (server)`);
            try {
              if (apiclient.penalize_leave) {
                await apiclient.penalize_leave({ table_id: tableId, user_id: uid, penalty: 60 });
              }
            } catch (e) {
              console.warn("penalize_leave not available or failed", e);
            }
          });
        }
        prevPlayersRef.current = currentIds;
      } catch (err) {
        console.warn("Player-leave detection error", err);
      }

      const turnChanged = info?.active_user_id !== data.active_user_id;
      console.log("🔄 Refresh:", { prevActiveUser: info?.active_user_id, newActiveUser: data.active_user_id, turnChanged });

      setInfo(data);

      // Keep wild joker visible after reveal
      if (data.wild_joker_rank) {
        setRevealedWildJoker(data.wild_joker_rank);
      }

      if (data.status === "playing") {
        const r = { table_id: tableId };
        const rr = await apiclient.get_round_me(r);
        if (!rr.ok) {
          console.error("❌ get_round_me failed with status:", rr.status);
          toast.error("Failed to refresh hand");
          setLoading(false);
          return;
        }
        const roundData = await rr.json();
        setMyRound(roundData);
        const newHasDrawn = roundData.hand.length === 14;
        setHasDrawn(newHasDrawn);
      }
      setLoading(false);
    } catch (e) {
      console.error("❌ Failed to refresh:", e);
      toast.error("Connection error - retrying...");
      setLoading(false);
    }
  };

  const fetchRoundHistory = async () => {
    if (!info?.table_id) return;
    try {
      const response = await apiclient.get_round_history({ table_id: info.table_id });
      const data = await response.json();
      setRoundHistory(data.rounds || []);
    } catch (error) {
      console.error("Failed to fetch round history:", error);
    }
  };

  // Poll fallback (still keep occasional refresh in case sockets miss something)
  useEffect(() => {
    if (!tableId) return;
    const interval = setInterval(() => {
      refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [tableId]);

  useEffect(() => {
    if (!tableId) return;
    refresh();
  }, [tableId]);

  const canStart = useMemo(() => {
    if (!info || !user) return false;
    const seated = info.players.length;
    const isHost = user.id === info.host_user_id;
    return info.status === "waiting" && seated >= 2 && isHost;
  }, [info, user]);

  const isMyTurn = useMemo(() => {
    if (!user) return false;
    return info?.active_user_id === user.id;
  }, [info, user]);

  const isDisqualified = useMemo(() => {
    if (!user || !info?.players) return false;
    return info.players.find(p => p.user_id === user.id)?.disqualified || false;
  }, [info, user]);

  // Reset hasDrawn when turn changes
  useEffect(() => {
    if (!isMyTurn) {
      setHasDrawn(false);
      setSelectedCard(null);
      setSelectedCardIndex(null);
      setLastDrawnCard(null);
    }
  }, [isMyTurn]);

  const onCopy = () => {
    if (!info?.code) return;
    navigator.clipboard.writeText(info.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onStart = async () => {
    if (!info || !tableId) return;
    setStarting(true);
    try {
      const deck_count = determineDecksForPlayers(info.players.length);
      const body = { table_id: tableId, deck_count };
      const res = await apiclient.start_game(body);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Start game failed:", errorText);
        toast.error(`Failed to start game: ${errorText}`);
        return;
      }
      const data = await res.json();
      toast.success(`Round #${data.number} started`);
      await refresh();
    } catch (e) {
      console.error("Start game error:", e);
      toast.error(e?.message || "Failed to start game");
    } finally {
      setStarting(false);
    }
  };

  const onDrawStock = async () => {
    if (!tableId || !isMyTurn || hasDrawn) return;
    setActing(true);
    try {
      const body = { table_id: tableId };
      const res = await apiclient.draw_stock(body);
      if (!res.ok) {
        const errText = await res.text().catch(() => "draw_stock failed");
        toast.error(errText);
        setActing(false);
        return;
      }
      const data = await res.json();
      setMyRound(data);
      try {
        const prevHand = myRound?.hand || [];
        const newCard = (data.hand || []).find((card) => !prevHand.some((c) => c.rank === card.rank && c.suit === card.suit));
        if (newCard) {
          setLastDrawnCard({ rank: newCard.rank, suit: newCard.suit });
        }
      } catch (e) { }
      setHasDrawn(true);
      toast.success("Drew from stock");
      socket.emit("game_update", { tableId });
      setTimeout(() => refresh(), 120);
    } catch (e) {
      console.error("draw stock error", e);
      toast.error("Failed to draw from stock");
    } finally {
      setActing(false);
    }
  };

  const onDrawDiscard = async () => {
    if (!tableId || !isMyTurn || hasDrawn) return;
    setActing(true);
    try {
      const body = { table_id: tableId };
      const res = await apiclient.draw_discard(body);
      if (!res.ok) {
        const errText = await res.text().catch(() => "draw_discard failed");
        toast.error(errText);
        setActing(false);
        return;
      }
      const data = await res.json();
      setMyRound(data);
      try {
        const prevHand = myRound?.hand || [];
        const newCard = (data.hand || []).find((card) => !prevHand.some((c) => c.rank === card.rank && c.suit === card.suit));
        if (newCard) {
          setLastDrawnCard({ rank: newCard.rank, suit: newCard.suit });
        } else if (myRound?.discard_top) {
          const code = myRound.discard_top;
          if (code === "JOKER") setLastDrawnCard({ rank: "JOKER", suit: null });
          else {
            const suit = code.slice(-1);
            const rank = code.slice(0, -1);
            setLastDrawnCard({ rank, suit });
          }
        }
      } catch (e) { }
      setHasDrawn(true);
      toast.success("Drew from discard pile");
      socket.emit("game_update", { tableId });
      setTimeout(() => refresh(), 120);
    } catch (e) {
      console.error("draw discard error", e);
      toast.error("Failed to draw from discard");
    } finally {
      setActing(false);
    }
  };

  const onDiscard = async () => {
    if (!tableId || !selectedCard || !hasDrawn) return;
    setActing(true);
    try {
      const body = { table_id: tableId, card: selectedCard };
      const res = await apiclient.discard_card(body);
      if (!res.ok) {
        const errText = await res.text().catch(() => "discard failed");
        toast.error(errText);
        setActing(false);
        return;
      }
      const data = await res.json();
      toast.success("Card discarded. Next player's turn.");
      socket.emit("game_update", { tableId });
      setTimeout(() => refresh(), 120);

      setSelectedCard(null);
      setLastDrawnCard(null);
      setHasDrawn(false);

      if (data && data.hand) {
        setMyRound(data);
      }
      await refresh();
    } catch (e) {
      console.error("discard error", e);
      toast.error("Failed to discard card");
    } finally {
      setActing(false);
    }
  };

  const fetchRevealedHands = async () => {
    console.log("📊 Fetching revealed hands...");
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await apiclient.get_revealed_hands({ table_id: tableId });
        if (!resp.ok) {
          const errorText = await resp.text();
          lastError = { status: resp.status, message: errorText };
          if (attempt < 3 && resp.status === 400) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          } else {
            break;
          }
        }
        const data = await resp.json();
        console.log("✅ Revealed hands fetched:", data);
        setRevealedHands(data);
        setShowScoreboardModal(true);
        setShowScoreboardPanel(true);
        return data;
      } catch (error) {
        console.error(`❌ Error fetching revealed hands (attempt ${attempt}/3):`, error);
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          break;
        }
      }
    }
    const errorMsg = lastError?.message || lastError?.status || "Network error";
    toast.error(`Failed to load scoreboard: ${errorMsg}`);
    console.error("🚨 Final scoreboard error:", lastError);
    return null;
  };




  const onNextRound = async () => {
    if (!tableId || !info) return;
    setStarting(true);
    try {
      const players = info.players || [];
      const firstPlayerId = info.first_player_id || info.active_user_id || info.host_user_id;
      let nextFirstPlayerId = firstPlayerId;
      if (firstPlayerId && players.length > 0) {
        const idx = players.findIndex((p) => p.user_id === firstPlayerId);
        if (idx >= 0) {
          nextFirstPlayerId = players[(idx + 1) % players.length].user_id;
        } else {
          const hostIdx = players.findIndex((p) => p.user_id === info.host_user_id);
          nextFirstPlayerId = players[(hostIdx + 1) % players.length].user_id;
        }
      }

      const body = { table_id: tableId, first_player_id: nextFirstPlayerId };
      const res = await apiclient.start_next_round(body);
      if (!res.ok) {
        const errorText = await res.text().catch(() => "start_next_round failed");
        toast.error(errorText);
        setStarting(false);
        return;
      }
      const data = await res.json();
      toast.success(`Round #${data.number} started!`);
      await refresh();
    } catch (e) {
      console.error("start next round error", e);
      toast.error(e?.message || "Failed to start next round");
    } finally {
      setStarting(false);
    }
  };

  // Drop game handler - only allowed before player has drawn
  const onDropGame = async () => {
    if (!tableId || droppingGame) return;
    const playersCount = info?.players?.length || 0;
    if (playersCount <= 2) {
      toast.error("Drop is not allowed for 2-player matches.");
      return;
    }
    if (hasDrawn) {
      toast.error("You can only drop before drawing a card.");
      return;
    }
    setDroppingGame(true);
    try {
      const body = { table_id: tableId };
      const res = await apiclient.drop_game(body);
      if (!res.ok) {
        const errText = await res.text().catch(() => "drop_game failed");
        toast.error(errText);
        setDroppingGame(false);
        return;
      }
      await res.json();
      toast.success("You have dropped from the game (20 point penalty)");
      await refresh();
    } catch (e) {
      console.error("drop game error", e);
      toast.error(e?.message || "Failed to drop game");
    } finally {
      setDroppingGame(false);
    }
  };

  // Spectate handlers
  const requestSpectate = async (playerId) => {
    if (!tableId || spectateRequested) return;
    setSpectateRequested(true);
    try {
      const body = { table_id: tableId, player_id: playerId };
      await apiclient.request_spectate(body);
      toast.success("Spectate request sent");
    } catch (e) {
      toast.error(e?.message || "Failed to request spectate");
    } finally {
      setSpectateRequested(false);
    }
  };

  const grantSpectate = async (spectatorId) => {
    if (!tableId) return;
    try {
      const body = { table_id: tableId, spectator_id: spectatorId, granted: true };
      await apiclient.grant_spectate(body);
      setSpectateRequests((prev) => prev.filter((id) => id !== spectatorId));
      toast.success("Spectate access granted");
    } catch (e) {
      toast.error(e?.message || "Failed to grant spectate");
    }
  };

  // Voice control handler
  const toggleVoiceMute = async () => {
    if (!tableId || !user) return;
    try {
      const body = { table_id: tableId, user_id: user.id, muted: !voiceMuted };
      await apiclient.mute_player(body);
      setVoiceMuted(!voiceMuted);
      toast.success(voiceMuted ? "Unmuted" : "Muted");
    } catch (e) {
      toast.error(e?.message || "Failed to toggle mute");
    }
  };

  const onCardSelect = (card, idx) => {
    if (!hasDrawn) return;
    setSelectedCard({ rank: card.rank, suit: card.suit || null, joker: card.joker || false });
    setSelectedCardIndex(idx);
  };

  const onReorderHand = (reorderedHand) => {
    if (myRound) {
      setMyRound({ ...myRound, hand: reorderedHand });
    }
  };

  const onSelectCard = (card) => {
    // Legacy support if needed, but prefer onCardSelect
    if (!hasDrawn) return;
    setSelectedCard(card);
    // Cannot determine index easily here, might break selection of duplicates if used
  };



  const onClearMelds = () => {
    setMeld1([null, null, null]);
    setMeld2([null, null, null]);
    setMeld3([null, null, null]);
    setMeld4([null, null, null, null]);
    setLeftover([null]);
    toast.success("Melds cleared");
  };

  const onDeclare = async () => {
    console.log("🎯 Declare clicked");

    // Count actual cards (non-null)
    const countCards = (arr) => (arr || []).filter(c => c !== null).length;

    const meld1Count = countCards(meld1);
    const meld2Count = countCards(meld2);
    const meld3Count = countCards(meld3);
    const meld4Count = countCards(meld4);
    const totalPlacedInMelds = meld1Count + meld2Count + meld3Count + meld4Count;
    const leftoverCount = countCards(leftover);
    const totalCards = totalPlacedInMelds + leftoverCount;

    if (totalCards !== 14) {
      toast.error(`You must have 14 cards to declare (13 in melds + 1 deadwood). Currently have ${totalCards}.`);
      return;
    }

    if (totalPlacedInMelds !== 13) {
      toast.error(`You must place exactly 13 cards in the Meld slots (Meld 1–4). \nCurrently placed: ${totalPlacedInMelds}.`);
      return;
    }

    if (leftoverCount !== 1) {
      toast.error(`You must have exactly 1 card in 'Leftover' (your discard card).`);
      return;
    }

    if (!tableId) return;
    if (!isMyTurn) {
      toast.error("It's not your turn!");
      return;
    }

    // Client-side strict validation
    const groups = [];
    const pushGroup = (grp) => { if (grp && grp.filter(c => c !== null).length > 0) groups.push(grp.filter(c => c !== null)); };
    pushGroup(meld1);
    pushGroup(meld2);
    pushGroup(meld3);
    pushGroup(meld4);

    console.log("🔍 Validating hand...", groups);
    const clientVal = validateHand(groups, info.wild_joker_rank, true);
    if (!clientVal.valid) {
      console.warn("⚠️ Client validation failed:", clientVal.reason);
    }

    setActing(true);
    try {
      const discardGroups = groups.map((group) => group.map((card) => ({ rank: card.rank, suit: card.suit, joker: card.joker })));
      const body = { table_id: tableId, groups: discardGroups };
      const res = await apiclient.declare(body);
      if (res.ok) {
        const data = await res.json();
        socket.emit("declare_made", { tableId });

        if (data.valid) {
          toast.success(`🏆 Valid declaration! You win round #${data.scores ? Object.keys(data.scores).length : ''} with 0 points!`);
          await fetchRevealedHands();
        } else {
          toast.error(`⚠️ Invalid declaration! ${data.message || 'Penalty applied.'}`);
          await fetchRevealedHands();
        }
      } else {
        let errorMessage = "Failed to declare";
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          const errorText = await res.text();
          errorMessage = errorText || errorMessage;
        }
        toast.error(`❌ ${errorMessage}`, { duration: 5000 });
      }
    } catch (error) {
      console.error("Declare exception", error);
      let errorMsg = "Network error";
      if (error?.message) errorMsg = error.message;
      else if (typeof error === "string") errorMsg = error;
      toast.error(`❌ Failed to declare: ${errorMsg}`, { duration: 5000 });
    } finally {
      setActing(false);
    }
  };


  useEffect(() => {
    console.log("🔍 Discard Button Visibility Check:", {
      isMyTurn,
      hasDrawn,
      selectedCard,
      handLength: myRound?.hand.length,
      showDiscardButton: isMyTurn && hasDrawn && selectedCard !== null,
      user_id: user?.id,
      active_user_id: info?.active_user_id,
    });
  }, [isMyTurn, hasDrawn, selectedCard, myRound, user, info]);

  if (!tableId) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-foreground mb-4">Missing tableId.</p>
          <button onClick={() => navigate("/")} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------- Render ------------------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="relative">
        <GameRules defaultOpen={false} />

        {/* Mobile Portrait Warning Overlay */}
        <div className="lg:hidden fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-8 text-center pointer-events-auto landscape:hidden">
          <div className="mb-6 animate-bounce">
            <svg className="w-16 h-16 text-yellow-500 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Please Rotate Your Device</h2>
          <p className="text-slate-400">
            For the best Rummy experience, please flip your phone to landscape mode.
          </p>
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-foreground">Table</h2>
            <div className="flex items-center gap-2">
              {info?.status === "playing" && !isDisqualified && !info.players.find(p => p.user_id === user.id)?.is_spectator && (
                <button
                  onClick={onDropGame}
                  disabled={droppingGame || !isMyTurn || hasDrawn || info.players.length < 3}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-orange-700 hover:bg-orange-600 text-white rounded-lg font-medium shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    info.players.length < 3 ? "Drop allowed for 3+ players only" :
                      hasDrawn ? "Cannot drop after drawing" :
                        !isMyTurn ? "Wait for your turn to drop" :
                          "Drop game (20pt penalty)"
                  }
                >
                  <UserX className="w-5 h-5" />
                  {droppingGame ? "Dropping..." : "Drop"}
                </button>
              )}

              <button onClick={() => navigate("/")} className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg font-medium shadow-lg transition-colors">
                <LogOut className="w-5 h-5" />
                Leave Table
              </button>
            </div>
          </div>

          {/* layout - left main, right sidebar */}
          {loading ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              <p className="text-muted-foreground animate-pulse">Loading Table...</p>
            </div>
          ) : !info ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              <p className="text-muted-foreground">Table info not available.</p>
            </div>
          ) : (
            <RummyProvider players={info.players} activeUserId={info.active_user_id} currentUserId={user?.id}>
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr,300px]">
                <div className="bg-card border border-border rounded-lg p-4 order-2 lg:order-1">
                  {info.status === "playing" ? (
                    /* ================= GAME BOARD UI ================= */
                    <div className="flex flex-col h-full relative">
                      {/* Top: Table Area (Opponents + Center Piles) */}
                      {/* Top: Table Area (Opponents + Center Piles) */}
                      <div className="table-3d-container relative flex-1 min-h-[360px] rounded-xl overflow-hidden shadow-2xl mb-4">
                        <CasinoTable3D tableColor={tableColor}>
                          {/* Color Toggle */}
                          <div className="absolute top-4 right-4 z-50 flex gap-2">
                            <button
                              onClick={() => setTableColor("green")}
                              className={`w-6 h-6 rounded-full border-2 ${tableColor === "green" ? "border-white scale-110 shadow-lg" : "border-green-800/50"} bg-green-700`}
                              title="Green Felt"
                            />
                            <button
                              onClick={() => setTableColor("red-brown")}
                              className={`w-6 h-6 rounded-full border-2 ${tableColor === "red-brown" ? "border-white scale-110 shadow-lg" : "border-red-900/50"} bg-[#6b2f2f]`}
                              title="Red-Brown Felt"
                            />
                          </div>

                          {/* Opponent Avatars */}
                          <TableDiagram players={info.players} activeUserId={info.active_user_id} currentUserId={user?.id} />

                          {/* Center Piles (Deck & Discard) */}
                          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-12 z-10">
                            {/* Deck/Stock */}
                            <div
                              onClick={onDrawStock}
                              className={`relative group cursor-pointer transition-all ${isMyTurn && !hasDrawn ? 'hover:scale-105 hover:-translate-y-2' : ''}`}
                            >
                              <div className={`absolute inset-0 bg-yellow-400 blur-md rounded-lg opacity-0 transition-opacity ${isMyTurn && !hasDrawn ? 'group-hover:opacity-40 animate-pulse' : ''}`} />
                              <CardBack className="w-24 h-36 shadow-2xl relative z-10" />
                              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-100 bg-black/60 px-3 py-1 rounded-full border border-white/10 whitespace-nowrap">
                                Deck ({myRound?.stock_count || 0})
                              </div>
                            </div>

                            {/* Discard Pile */}
                            <div
                              onClick={onDrawDiscard}
                              className={`discard-pile-area relative group cursor-pointer transition-all ${isMyTurn && !hasDrawn ? 'hover:scale-105 hover:-translate-y-2' : ''}`}
                            >
                              <div className={`absolute inset-0 bg-yellow-400 blur-md rounded-lg opacity-0 transition-opacity ${isMyTurn && !hasDrawn && myRound?.discard_top ? 'group-hover:opacity-40 animate-pulse' : ''}`} />
                              {myRound?.discard_top ? (
                                <PlayingCard
                                  card={parseCardCode(myRound.discard_top) || { rank: "?", suit: "?" }}
                                  onClick={() => { }}
                                  className="w-24 h-36 shadow-2xl relative z-10"
                                />
                              ) : (
                                <div className="w-24 h-36 border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center text-white/20 text-xs bg-white/5 relative z-10">
                                  Empty
                                </div>
                              )}
                              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-100 bg-black/60 px-3 py-1 rounded-full border border-white/10 whitespace-nowrap">
                                Discard Pile
                              </div>
                            </div>
                          </div>

                          {/* Wild Joker Display on Table */}
                          {revealedWildJoker && (
                            <div className="absolute top-4 left-4 bg-black/40 backdrop-blur border border-yellow-500/30 p-2 rounded-lg flex flex-col items-center">
                              <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider mb-1">Wild Joker</span>
                              <div className="text-xl font-bold text-white">{revealedWildJoker}</div>
                            </div>
                          )}
                        </CasinoTable3D>
                      </div>

                      {/* Bottom: Player Area (Melds + Hand) */}
                      <div className="space-y-4">
                        {/* Melds Row */}
                        <div className="melds-container flex flex-wrap justify-center gap-2 lg:gap-4 overflow-x-auto pb-2">
                          <MeldSlotBox
                            title="Meld 1"
                            slots={meld1}
                            setSlots={setMeld1}
                            myRound={myRound}
                            isLocked={meldLocks.meld1}
                            onToggleLock={() => toggleMeldLock("meld1")}
                            tableId={tableId}
                            onRefresh={refresh}
                            gameMode={info.wild_joker_mode}
                            capacity={3}
                            boxIndex={0}
                          />
                          <MeldSlotBox
                            title="Meld 2"
                            slots={meld2}
                            setSlots={setMeld2}
                            myRound={myRound}
                            isLocked={meldLocks.meld2}
                            onToggleLock={() => toggleMeldLock("meld2")}
                            tableId={tableId}
                            onRefresh={refresh}
                            gameMode={info.wild_joker_mode}
                            capacity={3}
                            boxIndex={1}
                          />
                          <MeldSlotBox
                            title="Meld 3"
                            slots={meld3}
                            setSlots={setMeld3}
                            myRound={myRound}
                            isLocked={meldLocks.meld3}
                            onToggleLock={() => toggleMeldLock("meld3")}
                            tableId={tableId}
                            onRefresh={refresh}
                            gameMode={info.wild_joker_mode}
                            capacity={3}
                            boxIndex={2}
                          />
                          <MeldSlotBox
                            title="Meld 4"
                            slots={meld4}
                            setSlots={setMeld4}
                            myRound={myRound}
                            isLocked={meldLocks.meld4}
                            onToggleLock={() => toggleMeldLock("meld4")}
                            tableId={tableId}
                            onRefresh={refresh}
                            capacity={4}
                            boxIndex={3}
                          />
                          <LeftoverSlotBox
                            slots={leftover}
                            setSlots={setLeftover}
                            myRound={myRound}
                            isLocked={meldLocks.leftover}
                            onToggleLock={() => toggleMeldLock("leftover")}
                            tableId={tableId}
                            onRefresh={refresh}
                            gameMode={info.wild_joker_mode}
                            boxIndex={4}
                          />
                        </div>

                        {/* Hand Strip Panel */}
                        <div className={`hand-strip-container p-4 rounded-xl border transition-colors ${isMyTurn ? "bg-black/40 border-amber-500/30 shadow-lg shadow-amber-900/20" : "bg-black/20 border-white/5"}`}>
                          <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                              Your Hand
                              {isMyTurn && <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded animate-pulse">Your Turn</span>}
                            </h3>

                            <div className="flex items-center gap-3">
                              <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white" onClick={onClearMelds}>
                                Reset Melds
                              </Button>

                              <Button
                                size="sm"
                                disabled={!isMyTurn || !hasDrawn || !selectedCard}
                                onClick={onDiscard}
                                className="bg-red-600 hover:bg-red-700 text-white font-medium shadow-md transition-all active:scale-95"
                              >
                                Discard Selected
                              </Button>

                              <Button
                                size="sm"
                                disabled={!isMyTurn}
                                onClick={onDeclare}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-md transition-all active:scale-95 shimmer"
                              >
                                Declare
                              </Button>
                            </div>
                          </div>

                          <HandStrip
                            hand={availableHand}
                            onCardClick={onCardSelect}
                            selectedIndex={selectedCardIndex}
                            highlightIndex={-1}
                            onReorder={onReorderHand}
                            draggedIndexExternal={draggedCardIndex}
                            setDraggedIndexExternal={setDraggedCardIndex}
                            onExternalDrop={(cardIndex, zoneId) => {
                              if (!myRound.hand || !myRound.hand[cardIndex]) return;
                              const card = myRound.hand[cardIndex];
                              const cardJson = JSON.stringify(card);

                              if (zoneId.startsWith("meld-")) {
                                const meldIdx = parseInt(zoneId.split("-")[1]);
                                if (!isNaN(meldIdx)) handleSlotDrop(meldIdx, cardJson);
                              } else if (zoneId === "deadwood") {
                                handleSlotDrop(4, cardJson);
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ================= LOBBY / WAITING UI ================= */
                    <div className="flex flex-col h-full">
                      {/* Sidebar Tabs */}
                      <div className="flex items-center border-b border-white/10 mb-4">
                        <button
                          onClick={() => setActiveTab("info")}
                          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === "info" ? "text-yellow-400" : "text-slate-400 hover:text-slate-300"}`}
                        >
                          Table Info
                          {activeTab === "info" && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-400" />}
                        </button>
                        <button
                          onClick={() => setActiveTab("history")}
                          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === "history" ? "text-yellow-400" : "text-slate-400 hover:text-slate-300"}`}
                        >
                          History
                          {activeTab === "history" && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-400" />}
                        </button>
                      </div>

                      {/* Tab Content */}
                      <div className="flex-1 overflow-y-auto">
                        {activeTab === "info" ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground">Room Code</p>
                                <p className="text-2xl font-bold tracking-wider text-green-400">{info.code}</p>
                              </div>

                              <button onClick={onCopy} className="inline-flex items-center gap-2 px-3 py-2 bg-green-800 text-green-100 rounded-lg hover:bg-green-700 transition-colors">
                                {copied ? (
                                  <>
                                    <Check className="w-4 h-4" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-4 h-4" /> Copy
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="border-t border-border pt-4">
                              <p className="text-sm text-muted-foreground mb-2">Players</p>
                              <div className="grid grid-cols-1 gap-3">
                                {/* Use RummyContext players if available for reactive updates */}
                                <RummyPlayersList info={info} activeUserId={info.active_user_id} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <HistoryTable tableId={tableId} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Move ChatSidebar and VoicePanel INSIDE Provider to access useRummy context for avatars */}
                  {user && info && tableId && (
                    <ChatSidebar tableId={tableId} currentUserId={user.id} players={info.players.map((p) => ({ userId: p.user_id, displayName: p.display_name || p.user_id.slice(0, 6), profileImage: p.profile_image_url }))} />
                  )}

                  {user && info && tableId && (
                    <VoicePanel tableId={tableId} currentUserId={user.id} isHost={info.host_user_id === user.id} players={info.players} />
                  )}


                  {/* --- existing UI continues unchanged --- */}

                  {/* Scoreboard Modal */}
                  <ScoreboardModal
                    isOpen={showScoreboardModal && !!revealedHands}
                    onClose={() => setShowScoreboardModal(false)}
                    data={revealedHands}
                    players={info?.players || []}
                    currentUserId={user?.id || ""}
                    tableId={tableId || ""}
                    hostUserId={info?.host_user_id || ""}
                    onNextRound={() => {
                      setShowScoreboardModal(false);
                      onNextRound();
                    }}
                  />

                  {/* Side Panel for Scoreboard - Legacy */}
                  {showScoreboardPanel && revealedHands && (
                    <div className="fixed right-0 top-0 h-full w-96 bg-gray-900/95 border-l-2 border-yellow-500 shadow-2xl z-50 overflow-y-auto animate-slide-in-right">
                      <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                          <h2 className="text-2xl font-bold text-yellow-400">Round Results</h2>
                          <button onClick={() => setShowScoreboardPanel(false)} className="text-gray-400 hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Round Scores */}
                        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-yellow-600">
                          <h3 className="text-lg font-semibold text-yellow-400 mb-3">Scores</h3>
                          {Object.entries(revealedHands.scores || {}).map(([uid, score]) => {
                            const playerName = revealedHands.player_names?.[uid] || "Unknown";
                            return (
                              <div key={uid} className="flex justify-between py-2 border-b border-gray-700 last:border-0">
                                <span className={uid === user?.id ? "text-yellow-400 font-semibold" : "text-gray-300"}>{playerName}</span>
                                <span className={`font-bold ${score === 0 ? "text-green-400" : "text-red-400"}`}>{score} pts</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* All Players' Hands */}
                        <div className="space-y-6">
                          {Object.entries(revealedHands.organized_melds || {}).map(([uid, melds]) => {
                            const playerName = revealedHands.player_names?.[uid] || "Unknown";
                            const playerScore = revealedHands.scores?.[uid] || 0;
                            const isWinner = playerScore === 0;

                            return (
                              <div key={uid} className="p-4 bg-gray-800 rounded-lg border-2" style={{ borderColor: isWinner ? "#10b981" : "#6b7280" }}>
                                <div className="flex justify-between items-center mb-3">
                                  <h4 className={`font-bold text-lg ${isWinner ? "text-green-400" : uid === user?.id ? "text-yellow-400" : "text-gray-300"}`}>
                                    {playerName}
                                    {isWinner && " 🏆"}
                                  </h4>
                                  <span className={`font-bold ${playerScore === 0 ? "text-green-400" : "text-red-400"}`}>{playerScore} pts</span>
                                </div>

                                {melds && melds.length > 0 ? (
                                  <div className="space-y-3">
                                    {melds.map((meld, idx) => {
                                      const meldType = meld.type || "unknown";
                                      let bgColor = "bg-gray-700";
                                      let borderColor = "border-gray-600";
                                      let label = "Cards";

                                      if (meldType === "pure") {
                                        bgColor = "bg-blue-900/40";
                                        borderColor = "border-blue-500";
                                        label = "Pure Sequence";
                                      } else if (meldType === "impure") {
                                        bgColor = "bg-purple-900/40";
                                        borderColor = "border-purple-500";
                                        label = "Impure Sequence";
                                      } else if (meldType === "set") {
                                        bgColor = "bg-orange-900/40";
                                        borderColor = "border-orange-500";
                                        label = "Set";
                                      }

                                      return (
                                        <div key={idx} className={`p-3 rounded border ${bgColor} ${borderColor}`}>
                                          <div className="text-xs text-gray-400 mb-2">{label}</div>
                                          <div className="flex flex-wrap gap-2">
                                            {(meld.cards || []).map((card, cardIdx) => (
                                              <div key={cardIdx} className="text-sm font-mono bg-white text-gray-900 px-2 py-1 rounded">
                                                {card.name || card.code || "??"}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-gray-500 text-sm">No melds</div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {revealedHands.can_start_next && (
                          <button
                            onClick={async () => {
                              try {
                                await apiclient.start_next_round();
                                setShowScoreboardPanel(false);
                                setRevealedHands(null);
                                await refresh();
                                toast.success("New round started!");
                              } catch (error) {
                                console.error("Error starting next round:", error);
                                toast.error("Failed to start next round");
                              }
                            }}
                            className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                          >
                            Start Next Round
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>


                {/* Sidebar - Table Info with Round History */}
                {tableInfoVisible && (
                  <div className={`bg-card border border-border rounded-lg shadow-lg ${tableInfoMinimized ? "w-auto" : "order-1 lg:order-2"}`}>
                    <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border rounded-t-lg">
                      <h3 className="text-sm font-semibold text-foreground">{tableInfoMinimized ? "Table" : "Table Info"}</h3>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setTableInfoMinimized(!tableInfoMinimized)} className="p-1 hover:bg-muted rounded" title={tableInfoMinimized ? "Expand" : "Minimize"}>
                          {tableInfoMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setTableInfoVisible(false)} className="p-1 hover:bg-muted rounded" title="Close">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {!tableInfoMinimized && (
                      <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                        {loading && <p className="text-muted-foreground">Loading…</p>}
                        {!loading && info && (
                          <>
                            <div>
                              <p className="text-sm text-muted-foreground">Room Code</p>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="text-lg font-mono text-foreground bg-background px-3 py-1 rounded border border-border">{info.code}</code>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(info.code);
                                    toast.success("Code copied!");
                                  }}
                                  className="p-1.5 hover:bg-muted rounded"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div>
                              <p className="text-sm text-muted-foreground mb-2">Players ({info.players.length})</p>
                              <div className="space-y-1.5">
                                {/* REPLACED manual loop with reactive component for Avatars */}
                                <RummyPlayersList info={info} activeUserId={info.active_user_id} />
                              </div>
                            </div>

                            <div className="border-t border-border pt-3">
                              <p className="text-sm text-muted-foreground">Status: <span className="text-foreground font-medium">{info?.status ?? "-"}</span></p>
                              {user && info.host_user_id === user.id && (
                                <button onClick={onStart} disabled={!canStart || starting} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 mt-2">
                                  <Play className="w-5 h-5" />
                                  {starting ? "Starting…" : "Start Game"}
                                </button>
                              )}
                              {info && info.status === "waiting" && user && user.id !== info.host_user_id && (
                                <p className="text-sm text-muted-foreground text-center py-2">Waiting for host to start...</p>
                              )}
                            </div>

                            {/* Round History & Points Table */}
                            {roundHistory.length > 0 && (
                              <div className="border-t border-border pt-3">
                                <h4 className="text-sm font-semibold text-foreground mb-2">Round History</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-border">
                                        <th className="text-left py-2 px-2 font-semibold text-foreground">Player</th>
                                        {roundHistory.map((round, idx) => (
                                          <th key={idx} className="text-center py-2 px-1 font-semibold text-foreground">R{round.round_number}</th>
                                        ))}
                                        <th className="text-right py-2 px-2 font-semibold text-yellow-600">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {info.players.map((player) => {
                                        let runningTotal = 0;
                                        return (
                                          <tr key={player.user_id} className="border-b border-border/50">
                                            <td className="py-2 px-2 text-foreground"><div className="flex items-center gap-1">{player.display_name || "Player"}</div></td>
                                            {roundHistory.map((round, idx) => {
                                              const isWinner = round.winner_user_id === player.user_id;
                                              const roundScore = round.scores[player.user_id] || 0;
                                              runningTotal += roundScore;
                                              return (
                                                <td key={idx} className="text-center py-2 px-1">
                                                  <div className="flex flex-col items-center">
                                                    <span className={isWinner ? "text-green-600 dark:text-green-500 font-semibold" : "text-muted-foreground"}>{roundScore}</span>
                                                    {isWinner && <Trophy className="w-3 h-3 text-yellow-500" />}
                                                  </div>
                                                </td>
                                              );
                                            })}
                                            <td className="text-right py-2 px-2 font-bold text-yellow-600">{runningTotal}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!tableInfoVisible && (
                  <button onClick={() => setTableInfoVisible(true)} className="fixed top-20 right-4 z-20 bg-card border border-border rounded-lg shadow-lg px-4 py-2 hover:bg-accent/50 transition-colors">
                    Show Table Info
                  </button>
                )}
              </div>
            </RummyProvider>
          )}

        </div>

      </div>
      {/* Mobile Styles for Table and Hand */}
      <style>{`
        @media (max-width: 768px) {
          .hand-strip-container {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 50;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(10px);
            padding-bottom: 20px; /* Safe area */
            border-top: 1px solid rgba(255,255,255,0.1);
          }
          .table-3d-container {
             transform: scale(0.65);
             transform-origin: top center;
             margin-top: -40px;
          }
           /* Adjust discard pile visibility */
          .discard-pile-area {
             transform: scale(0.9);
          }
           /* Make melds scrollable horizontally without wrapping weirdly */
          .melds-container {
             flex-wrap: nowrap;
             justify-content: flex-start;
             padding-left: 1rem;
             padding-right: 1rem;
          }
        }
      `}</style>
    </div >
  );
}
