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
  onCardDiscarded,
  onPlayerDisqualified,
  onTableFinished,
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
  Phone,
  MessageCircle,
  PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";

// ✅ ALL RUMMY COMPONENTS NOW UNDER games/rummy/
import { HandStrip } from "../games/rummy/components/HandStrip.jsx";
import { TableDiagram } from "../games/rummy/components/TableDiagram.jsx";
import { CasinoTable3D } from "../games/rummy/components/CasinoTable3D.jsx";
import { PlayerProfile } from "../games/rummy/components/PlayerProfile.jsx";
import PlayingCard from "../games/rummy/components/PlayingCard.jsx";
import { GameRules } from "../games/rummy/components/GameRules.jsx";
import SpectateControls from "../games/rummy/components/SpectateControls.jsx";
import { WildJokerRevealModal } from "../games/rummy/components/WildJokerRevealModal.jsx";
import { ScoreboardModal } from "../games/rummy/components/ScoreboardModal.jsx";
import { AllRoundsResultsModal } from "../games/rummy/components/AllRoundsResultsModal.jsx";
import VoicePanel from "../games/rummy/components/VoicePanel.jsx";
import HistoryTable from "../games/rummy/components/HistoryTable.jsx";
import ChatSidebar from "../games/rummy/components/ChatSidebar.jsx";
import { RummyProvider, useRummy } from "../games/rummy/RummyContext.jsx";
import { validateHand } from "../games/rummy/utils/validator.js";
import { canRevealInMode, normalizeWildMode, shouldShowWildCard } from "../games/rummy/utils/wildJokerMode.js";


// utilities
import { parseCardCode } from "../utils/cardCodeUtils";
import { initCursorSpark } from "../utils/cursor-spark"; // sparkles

// ui
import { Button } from "@/components/ui/Button";
import { useAuth } from "../auth/AuthContext";

// Simple CardBack
const CardBack = ({ className = "" }) => (
  <img
    src="/cards/BACK.png"
    alt="deck back"
    className={`rounded-lg shadow-2xl ${className}`}
    draggable={false}
    loading="eager"
    decoding="sync"
    fetchPriority="high"
  />
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
  onWildReveal,
}) => {
  const [locking, setLocking] = useState(false);

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
    if (cards.length < 3 || cards.length > 4) {
      toast.error("Use a pure sequence of 3 or 4 cards to reveal wildcard");
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
          onWildReveal?.(data.wild_joker_rank);
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

  const isClosedJoker = canRevealInMode(gameMode);

  return (
    <>
      <div
        data-drop-zone={`meld-${boxIndex}`} // ADDED: For mobile drag detection by HandStrip
        className={`border border-dashed rounded p-2 ${isLocked ? "border-amber-500/50 bg-amber-900/20" : "border-purple-500/30 bg-purple-900/10"}`}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-purple-400">{title} ({capacity} cards)</p>
          <div className="flex items-center gap-1">
            {isClosedJoker && (
              <button
                onClick={handleLockSequence}
                disabled={locking}
                title={slots.filter(s => s !== null).length < 3 ? "Add 3 or 4 pure cards first" : "Reveal wildcard (pure sequence required)"}
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
                e.dataTransfer.dropEffect = "move";
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
              onClick={() => {
                handleSlotClick(i);
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
                e.dataTransfer.dropEffect = "move";
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
                handleSlotClick(i);
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

    </>
  );
};

const RummyPlayersList = ({ info, activeUserId, onKickPlayer }) => {
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

  const activeCount = (info?.players || []).filter((x) => !x.is_spectator).length;
  const canHostKick =
    onKickPlayer &&
    user?.id &&
    info?.host_user_id === user.id &&
    info?.status === "playing" &&
    activeCount >= 3;

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
          {canHostKick && p.user_id !== info.host_user_id && !p.is_spectator && (
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-red-700/60 text-red-300 hover:bg-red-950/40 shrink-0"
              onClick={() => onKickPlayer(p.user_id)}
            >
              Kick
            </button>
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
  const [showAllRoundsModal, setShowAllRoundsModal] = useState(false);
  const [revealedHands, setRevealedHands] = useState(null);
  const [roundResultsByNumber, setRoundResultsByNumber] = useState({});

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
  const previousRoundNumberRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const prevIsMyTurnRef = useRef(false);

  // Table Info box state
  const [tableInfoVisible, setTableInfoVisible] = useState(true);
  const [tableInfoMinimized, setTableInfoMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [chatOpenSignal, setChatOpenSignal] = useState(0);
  const [voiceOpenSignal, setVoiceOpenSignal] = useState(0);
  const [rulesOpenSignal, setRulesOpenSignal] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [inCallActive, setInCallActive] = useState(false);

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
        const { meld1: m1, meld2: m2, meld3: m3, meld4: m4, leftover: lo, locks } = parsed;
        if (locks?.meld1) setMeld1(m1);
        if (locks?.meld2) setMeld2(m2);
        if (locks?.meld3) setMeld3(m3);
        if (locks?.meld4 && Array.isArray(m4)) setMeld4(m4);
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
    const data = { meld1, meld2, meld3, meld4, leftover, locks: meldLocks };
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [tableId, meld1, meld2, meld3, meld4, leftover, meldLocks]);

  const toggleMeldLock = (meldName) => {
    setMeldLocks((prev) => ({ ...prev, [meldName]: !prev[meldName] }));
    toast.success(`${meldName} ${!meldLocks[meldName] ? "locked" : "unlocked"}`);
  };

  const resetMeldBoard = () => {
    setMeld1([null, null, null]);
    setMeld2([null, null, null]);
    setMeld3([null, null, null]);
    setMeld4([null, null, null, null]);
    setLeftover([null]);
    setMeldLocks({
      meld1: false,
      meld2: false,
      meld3: false,
      meld4: false,
      leftover: false,
    });
    setSelectedCard(null);
    setSelectedCardIndex(null);
    setLastDrawnCard(null);
    setHasDrawn(false);
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
      refresh().catch((e) => console.warn("refresh error", e));
    });

    onDeclareUpdate(async () => {
      console.log("🏆 Real-time declare update received");
      await fetchRoundHistory();
      await fetchRevealedHands();
    });

    onCardDiscarded((payload) => {
      setMyRound((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          discard_top: payload?.discard_top || prev.discard_top,
        };
      });
      setInfo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          active_user_id: payload?.next_active_user_id || prev.active_user_id,
        };
      });
      refresh().catch(() => {});
    });

    onPlayerDisqualified((payload) => {
      const uid = payload?.user_id;
      const lim = payload?.limit ?? "?";
      const pts = payload?.total_points ?? "?";
      if (uid && user?.id && uid === user.id) {
        toast.error(`You reached the table limit (${pts} ≥ ${lim} pts) and are disqualified. You can spectate or leave the table.`, { duration: 6000 });
      } else {
        toast.info(`A player was disqualified (reached ${lim} pts).`, { duration: 4000 });
      }
      refresh().catch(() => {});
    });

    onTableFinished((payload) => {
      const champ = payload?.champion_user_id;
      if (champ && user?.id && champ === user.id) {
        toast.success("Match over — you are the winner!", { duration: 6000 });
      } else if (champ) {
        toast.success("Match over — a player has won the table.", { duration: 5000 });
      } else {
        toast.info("Match over.", { duration: 4000 });
      }
      refresh().catch(() => {});
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
      socket.off("round.state");
      socket.off("table.state");
      socket.off("round.declare");
      socket.off("card.discarded");
      socket.off("player.disqualified");
      socket.off("table.finished");
      socket.off("declare_made");
      socket.off("voice.muted");
      socket.off("voice.unmuted");
      socket.off("spectate.requested");
      socket.off("spectate.granted");
      socket.off("chat.message");
    };
  }, [tableId, user]);

  // Get cards that are placed in slots (not in hand anymore)
  const placedCards = useMemo(() => {
    const placed = [...meld1, ...meld2, ...meld3, ...meld4, ...leftover].filter((c) => c !== null);
    return placed;
  }, [meld1, meld2, meld3, meld4, leftover]);

  // Filter hand to exclude placed cards - FIX for duplicate cards
  const availableHand = useMemo(() => {
    if (!myRound) return [];

    // Normalize key helper
    const getKey = (c) => `${String(c.rank)}-${String(c.suit || "null")}-${c?.joker ? "1" : "0"}`;

    const placedCounts = new Map();
    placedCards.forEach((card) => {
      const key = getKey(card);
      placedCounts.set(key, (placedCounts.get(key) || 0) + 1);
    });

    const seenCounts = new Map();
    const result = myRound.hand.filter((handCard) => {
      const key = getKey(handCard);
      const placedCount = placedCounts.get(key) || 0;
      const seenCount = seenCounts.get(key) || 0;

      if (seenCount < placedCount) {
        seenCounts.set(key, seenCount + 1);
        return false; // Filter out (it's placed)
      }
      return true; // Keep in hand
    });

    // console.log("availableHand calc:", { total: myRound.hand.length, placed: placedCards.length, remaining: result.length });
    return result;
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
    if (refreshInFlightRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const query = { table_id: tableId };
      const res = await apiclient.get_table_info(query);
      if (!res.ok) {
        console.error("❌ get_table_info failed with status:", res.status);
        let errMsg = `Failed to refresh table info (${res.status})`;
        try {
          const err = await res.json();
          errMsg = err?.error || err?.detail || errMsg;
        } catch (_) {
          // keep fallback
        }
        toast.error(errMsg);
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
        if (roundData.wild_joker_revealed && roundData.wild_joker_rank) {
          setRevealedWildJoker(roundData.wild_joker_rank);
        } else {
          setRevealedWildJoker(null);
        }
        const newHasDrawn = roundData.hand.length === 14;
        setHasDrawn(newHasDrawn);
        if (roundData.finished_at) {
          const thisRound = Number(roundData.round_number);
          if (!Number.isNaN(thisRound) && !roundResultsByNumber[thisRound]) {
            void fetchRevealedHands(thisRound);
          }
        }
      }
      fetchRoundHistory();
      setLoading(false);
    } catch (e) {
      console.error("❌ Failed to refresh:", e);
      toast.error("Connection error - retrying...");
      setLoading(false);
    } finally {
      refreshInFlightRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void refresh();
      }
    }
  };

  const fetchRoundHistory = async () => {
    if (!tableId) return;
    try {
      const response = await apiclient.get_round_history({ table_id: tableId });
      const data = await response.json();
      const rounds = data.rounds || [];
      setRoundHistory(rounds);
      return rounds;
    } catch (error) {
      console.error("Failed to fetch round history:", error);
      return [];
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
    const seated = (info.players || []).filter((p) => !p.is_spectator).length;
    const requiredSeats = Number(info.max_players || 2);
    const isHost = user.id === info.host_user_id;
    return info.status === "waiting" && seated >= requiredSeats && isHost;
  }, [info, user]);

  const isMyTurn = useMemo(() => {
    if (!user) return false;
    return info?.active_user_id === user.id;
  }, [info, user]);

  const isDisqualified = useMemo(() => {
    if (!user || !info?.players) return false;
    return info.players.find(p => p.user_id === user.id)?.disqualified || false;
  }, [info, user]);
  const isHostUser = useMemo(() => {
    if (!user || !info) return false;
    return user.id === info.host_user_id;
  }, [info, user]);
  const kickablePlayers = useMemo(() => {
    if (!info?.players || !isHostUser) return [];
    const active = info.players.filter((p) => !p.is_spectator).length;
    if (active < 3) return [];
    return info.players.filter((p) => p.user_id !== info.host_user_id && !p.is_spectator);
  }, [info, isHostUser]);

  // Reset hasDrawn when turn changes
  useEffect(() => {
    if (!isMyTurn) {
      setHasDrawn(false);
      setSelectedCard(null);
      setSelectedCardIndex(null);
      setLastDrawnCard(null);
    }
  }, [isMyTurn]);

  useEffect(() => {
    if (isMyTurn && !prevIsMyTurnRef.current) {
      toast.success("It's your turn", { duration: 2500 });
    }
    prevIsMyTurnRef.current = !!isMyTurn;
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
    if (myRound?.finished_at) {
      toast.error("Round already finished. Start next round to continue.");
      return;
    }
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
    if (myRound?.finished_at) {
      toast.error("Round already finished. Start next round to continue.");
      return;
    }
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
    if (myRound?.finished_at) {
      toast.error("Round already finished. You cannot discard after declaration.");
      return;
    }
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

  const fetchRevealedHands = async (roundNumber = null) => {
    console.log("📊 Fetching revealed hands...");
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const query = { table_id: tableId };
        if (roundNumber != null) query.round_number = roundNumber;
        const resp = await apiclient.get_revealed_hands(query);
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
        if (data?.round_number != null) {
          setRoundResultsByNumber((prev) => ({ ...prev, [data.round_number]: data }));
        }
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

  const openRoundResults = async () => {
    const rounds = await fetchRoundHistory();
    const latestRound = rounds.length ? rounds[rounds.length - 1].round_number : null;
    if (!rounds.length) {
      toast.info("This is round 1. No previous rounds completed yet.");
      return;
    }
    if (latestRound != null) {
      const cached = roundResultsByNumber[latestRound];
      if (cached) {
        setRevealedHands(cached);
        setShowScoreboardModal(true);
        return;
      }
      await fetchRevealedHands(latestRound);
      return;
    }
    await fetchRevealedHands();
  };

  /** Open per-round scoreboard (cards / melds) for a given round number. */
  const openRoundScoreboardForRound = async (roundNumber, { closeAllRoundsModal = false } = {}) => {
    if (roundNumber == null) return;
    if (closeAllRoundsModal) setShowAllRoundsModal(false);
    const cached = roundResultsByNumber[roundNumber];
    if (cached) {
      setRevealedHands(cached);
      setShowScoreboardModal(true);
      return;
    }
    await fetchRevealedHands(roundNumber);
  };

  const openAllRoundsResults = async () => {
    await fetchRoundHistory();
    setShowAllRoundsModal(true);
  };




  const onNextRound = async () => {
    if (!tableId || !info) return;
    if (!user || user.id !== info.host_user_id) {
      toast.error("Only table host can start next round.");
      return;
    }
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

  const serializeCardsForSnapshot = (arr) =>
    (arr || [])
      .filter((c) => c != null && typeof c === "object" && c.rank)
      .map((c) => ({ rank: c.rank, suit: c.suit || null, joker: !!c.joker }));

  useEffect(() => {
    if (!tableId || !info || info.status !== "playing" || !myRound || myRound.finished_at) return;
    const timer = setTimeout(() => {
      (async () => {
        try {
          const body = {
            table_id: tableId,
            meld1: serializeCardsForSnapshot(meld1),
            meld2: serializeCardsForSnapshot(meld2),
            meld3: serializeCardsForSnapshot(meld3),
            meld4: serializeCardsForSnapshot(meld4),
            leftover: serializeCardsForSnapshot(leftover),
          };
          const res = await apiclient.meld_snapshot(body);
          if (!res.ok && res.status !== 400) {
            /* avoid spamming toasts for transient errors */
          }
        } catch {
          /* ignore */
        }
      })();
    }, 900);
    return () => clearTimeout(timer);
  }, [tableId, info?.status, myRound?.finished_at, meld1, meld2, meld3, meld4, leftover, myRound]);

  const handleKickPlayer = async (targetUserId) => {
    if (!tableId || !info || user.id !== info.host_user_id) return;
    const active = (info.players || []).filter((p) => !p.is_spectator).length;
    if (active < 3) {
      toast.error("At least 3 active players are required before the host can kick someone.");
      return;
    }
    if (!window.confirm("Remove this player from the current game? They receive a 20-point penalty.")) return;
    try {
      const res = await apiclient.kick_player({ table_id: tableId, target_user_id: targetUserId });
      if (!res.ok) {
        const errText = await res.text().catch(() => "Kick failed");
        toast.error(errText);
        return;
      }
      toast.success("Player removed from the table");
      await refresh();
    } catch (e) {
      toast.error(e?.message || "Kick failed");
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
  const denySpectate = async (spectatorId) => {
    if (!tableId) return;
    try {
      const body = { table_id: tableId, spectator_id: spectatorId, granted: false };
      await apiclient.grant_spectate(body);
      setSpectateRequests((prev) => prev.filter((id) => id !== spectatorId));
      toast.success("Spectate request denied");
    } catch (e) {
      toast.error(e?.message || "Failed to deny spectate");
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

  const dropHandCardToZone = (zoneIndex, card) => {
    if (!card) return false;
    if (zoneIndex === 0) {
      if (meldLocks.meld1) return false;
      const i = meld1.findIndex((x) => x === null);
      if (i === -1) return false;
      const next = [...meld1];
      next[i] = card;
      setMeld1(next);
      return true;
    }
    if (zoneIndex === 1) {
      if (meldLocks.meld2) return false;
      const i = meld2.findIndex((x) => x === null);
      if (i === -1) return false;
      const next = [...meld2];
      next[i] = card;
      setMeld2(next);
      return true;
    }
    if (zoneIndex === 2) {
      if (meldLocks.meld3) return false;
      const i = meld3.findIndex((x) => x === null);
      if (i === -1) return false;
      const next = [...meld3];
      next[i] = card;
      setMeld3(next);
      return true;
    }
    if (zoneIndex === 3) {
      if (meldLocks.meld4) return false;
      const i = meld4.findIndex((x) => x === null);
      if (i === -1) return false;
      const next = [...meld4];
      next[i] = card;
      setMeld4(next);
      return true;
    }
    if (zoneIndex === 4) {
      if (meldLocks.leftover) return false;
      const i = leftover.findIndex((x) => x === null);
      if (i === -1) return false;
      const next = [...leftover];
      next[i] = card;
      setLeftover(next);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (selectedCardIndex == null) return;
    if (selectedCardIndex >= availableHand.length) {
      setSelectedCardIndex(null);
      setSelectedCard(null);
    }
  }, [availableHand.length, selectedCardIndex]);

  const onSelectCard = (card) => {
    // Legacy support if needed, but prefer onCardSelect
    if (!hasDrawn) return;
    setSelectedCard(card);
    // Cannot determine index easily here, might break selection of duplicates if used
  };



  const onClearMelds = () => {
    resetMeldBoard();
    toast.success("Melds cleared");
  };

  useEffect(() => {
    const currentRound = myRound?.round_number ?? null;
    if (currentRound === null) return;
    if (previousRoundNumberRef.current === null) {
      previousRoundNumberRef.current = currentRound;
      return;
    }
    if (currentRound !== previousRoundNumberRef.current) {
      previousRoundNumberRef.current = currentRound;
      resetMeldBoard();
    }
  }, [myRound?.round_number]);

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

    const meldSizes = [meld1Count, meld2Count, meld3Count, meld4Count].sort((a, b) => a - b);
    const hasValidShape =
      meldSizes[0] === 3 &&
      meldSizes[1] === 3 &&
      meldSizes[2] === 3 &&
      meldSizes[3] === 4;
    if (!hasValidShape) {
      toast.error("Declare format must be exactly 4 melds with sizes 3,3,3,4 (order can vary).");
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

        // Server marks round finished after declaration; prevent extra discard/draw actions.
        setSelectedCard(null);
        setSelectedCardIndex(null);
        setHasDrawn(false);
        setLastDrawnCard(null);

        if (data.valid) {
          toast.success(`🏆 Valid declaration! You win round #${data.scores ? Object.keys(data.scores).length : ''} with 0 points!`);
          await fetchRevealedHands();
        } else {
          toast.error(`⚠️ Invalid declaration! ${data.message || 'Penalty applied.'}`);
          await fetchRevealedHands();
        }
        await refresh();
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
    <div className="rummy-play-shell min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="relative">
        <GameRules
          defaultOpen={false}
          hideToggleButton={true}
          openSignal={rulesOpenSignal}
        />

        <div className="fixed right-2 md:right-3 z-[75] flex flex-col gap-2 md:top-1/2 md:-translate-y-1/2 max-md:top-auto max-md:bottom-52">
          <button
            type="button"
            onClick={() => {
              setVoicePanelOpen(true);
              setVoiceOpenSignal((v) => v + 1);
            }}
            className={`w-11 h-11 rounded-xl border shadow-xl flex items-center justify-center transition-all ${inCallActive || voicePanelOpen
              ? "bg-emerald-700/90 hover:bg-emerald-600 text-emerald-100 border-emerald-500 ring-2 ring-emerald-400/40"
              : "bg-slate-800/90 hover:bg-slate-700 text-slate-100 border-slate-700"
              }`}
            title="Open call panel"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setChatPanelOpen(true);
              setChatOpenSignal((v) => v + 1);
            }}
            className={`relative w-11 h-11 rounded-xl border shadow-xl flex items-center justify-center transition-all ${chatPanelOpen
              ? "bg-blue-700/95 hover:bg-blue-600 text-blue-100 border-blue-500 ring-2 ring-blue-400/40"
              : "bg-blue-800/90 hover:bg-blue-700 text-blue-100 border-blue-700/60"
              }`}
            title="Open chat panel"
          >
            <MessageCircle className="w-4 h-4" />
            {chatUnreadCount > 0 && !chatPanelOpen && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {chatUnreadCount > 9 ? "9+" : chatUnreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setQuickPanelOpen((v) => !v)}
            className={`w-11 h-11 rounded-xl border shadow-xl flex items-center justify-center transition-all ${quickPanelOpen
              ? "bg-amber-700/95 hover:bg-amber-600 text-amber-100 border-amber-500 ring-2 ring-amber-400/40"
              : "bg-emerald-800/90 hover:bg-emerald-700 text-emerald-100 border-emerald-700/60"
              }`}
            title="Open quick actions"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        </div>

        {quickPanelOpen && (
          <div className="fixed right-16 top-1/2 -translate-y-1/2 z-[74] w-64 max-h-[75vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur p-2 shadow-2xl flex flex-col gap-1">
            <button type="button" onClick={() => { setTableInfoVisible((v) => !v); setQuickPanelOpen(false); }} className="text-left px-3 py-2 rounded-md text-sm text-slate-100 hover:bg-slate-800">1. Table info (toggle)</button>
            <button type="button" onClick={() => { openRoundResults(); setQuickPanelOpen(false); }} className="text-left px-3 py-2 rounded-md text-sm text-slate-100 hover:bg-slate-800">2. Previous round scoreboard</button>
            <button type="button" onClick={() => { openAllRoundsResults(); setQuickPanelOpen(false); }} className="text-left px-3 py-2 rounded-md text-sm text-slate-100 hover:bg-slate-800">3. All round scoreboard</button>
            <button type="button" onClick={() => { setRulesOpenSignal((v) => v + 1); setQuickPanelOpen(false); }} className="text-left px-3 py-2 rounded-md text-sm text-slate-100 hover:bg-slate-800">4. Game rules</button>

            {isDisqualified && (
              <button
                type="button"
                onClick={() => {
                  requestSpectate(user?.id);
                  setQuickPanelOpen(false);
                }}
                className="text-left px-3 py-2 rounded-md text-sm text-cyan-100 hover:bg-cyan-900/40 border border-cyan-800/60"
              >
                5. Request spectate
              </button>
            )}

            {isHostUser && spectateRequests.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-700">
                <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-amber-300">Spectate requests</p>
                {spectateRequests.map((uid) => {
                  const label = info?.players?.find((p) => p.user_id === uid)?.display_name || uid.slice(0, 8);
                  return (
                    <div key={`spec-${uid}`} className="mx-1 mb-1 rounded-md bg-slate-800/80 px-2 py-2">
                      <p className="text-xs text-slate-200 mb-1 truncate">{label}</p>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => grantSpectate(uid)} className="flex-1 rounded bg-green-700 hover:bg-green-600 text-white text-xs py-1">Allow</button>
                        <button type="button" onClick={() => denySpectate(uid)} className="flex-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs py-1">Deny</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isHostUser && (
              <div className="mt-2 pt-2 border-t border-slate-700">
                <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-rose-300">Kick player (host)</p>
                {kickablePlayers.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-slate-400">Need at least 3 active players to kick.</p>
                ) : (
                  kickablePlayers.map((p) => (
                    <button
                      key={`kick-${p.user_id}`}
                      type="button"
                      onClick={() => {
                        handleKickPlayer(p.user_id);
                        setQuickPanelOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-md text-xs text-rose-100 hover:bg-rose-900/40 border border-rose-900/50 mb-1"
                    >
                      Kick {p.display_name || p.user_id.slice(0, 8)}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-foreground">Table</h2>
            <div className="flex items-center gap-2">
              {canStart && (
                <button
                  onClick={onStart}
                  disabled={!canStart || starting}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg font-medium shadow-lg transition-colors disabled:opacity-50"
                >
                  <Play className="w-5 h-5" />
                  {starting ? "Starting…" : "Start Game"}
                </button>
              )}
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

          {!loading && info?.status === "finished" && (
            <div className="mb-4 rounded-lg border border-amber-600/50 bg-amber-950/50 px-4 py-3 text-amber-100 text-sm">
              <span className="font-semibold">This table has ended</span>
              {info.champion_user_id ? (
                <span className="ml-2">
                  — Winner:{" "}
                  {info.players?.find((p) => p.user_id === info.champion_user_id)?.display_name ||
                    info.champion_user_id?.slice(0, 8) ||
                    "Player"}
                </span>
              ) : (
                <span className="ml-2 text-amber-200/90">— No single winner recorded (all disqualified or left).</span>
              )}
            </div>
          )}

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
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr,300px] pb-36 md:pb-0">
                <div className="rummy-play-main bg-card border border-border rounded-lg p-3 sm:p-4 order-1">
                  {info.status === "playing" ? (
                    /* ================= GAME BOARD UI ================= */
                    <div className="flex flex-col h-full relative">
                      <div className="desktop-play-layout">
                        <div className="desktop-board-area">
                          {/* Top: Table Area (Opponents + Center Piles) */}
                          <div className="rummy-top-zone table-3d-container relative flex-1 min-h-[300px] sm:min-h-[360px] rounded-xl overflow-hidden shadow-2xl mb-4">
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
                              <div className="center-piles-row absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-start gap-5 sm:gap-8 z-10">
                            {/* Deck/Stock */}
                            <div
                              onClick={onDrawStock}
                              className={`center-pile-slot relative group cursor-pointer transition-all ${isMyTurn && !hasDrawn ? 'hover:scale-105 hover:-translate-y-2' : ''}`}
                            >
                              <div className={`absolute inset-0 bg-yellow-400 blur-md rounded-lg opacity-0 transition-opacity ${isMyTurn && !hasDrawn ? 'group-hover:opacity-40 animate-pulse' : ''}`} />
                              <CardBack className="center-pile-card w-[98px] h-[140px] sm:w-24 sm:h-36 shadow-2xl relative z-10" />
                              <div className="center-pile-label absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-100 bg-black/60 px-3 py-1 rounded-full border border-white/10 whitespace-nowrap">
                                Deck ({myRound?.stock_count || 0})
                              </div>
                            </div>

                            {/* Discard Pile */}
                            <div
                              onClick={onDrawDiscard}
                              className={`center-pile-slot discard-pile-area relative group cursor-pointer transition-all ${isMyTurn && !hasDrawn ? 'hover:scale-105 hover:-translate-y-2' : ''}`}
                            >
                              <div className={`absolute inset-0 bg-yellow-400 blur-md rounded-lg opacity-0 transition-opacity ${isMyTurn && !hasDrawn && myRound?.discard_top ? 'group-hover:opacity-40 animate-pulse' : ''}`} />
                              {myRound?.discard_top ? (
                                <PlayingCard
                                  card={parseCardCode(myRound.discard_top) || { rank: "?", suit: "?" }}
                                  onClick={() => { }}
                                  className="center-pile-card w-[98px] h-[140px] sm:w-24 sm:h-36 shadow-2xl relative z-10"
                                />
                              ) : (
                                <div className="center-pile-card w-[98px] h-[140px] sm:w-24 sm:h-36 border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center text-white/20 text-xs bg-white/5 relative z-10">
                                  Empty
                                </div>
                              )}
                              <div className="center-pile-label absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-100 bg-black/60 px-3 py-1 rounded-full border border-white/10 whitespace-nowrap">
                                Discard Pile
                              </div>
                            </div>

                            {/* Wildcard panel (always aligned with deck/discard size) */}
                            {(() => {
                              const mode = normalizeWildMode(info?.wild_joker_mode);
                              const showRealWildcard = shouldShowWildCard(mode, revealedWildJoker);
                              const label = mode === "no_joker"
                                ? "No Wildcard"
                                : showRealWildcard
                                  ? "Wild Joker"
                                  : "Wild Joker (Hidden)";
                              return (
                                <div className="center-pile-slot relative">
                                  <div className="center-pile-card w-[98px] h-[140px] sm:w-24 sm:h-36 rounded-lg border border-yellow-500/45 bg-black/45 flex items-center justify-center shadow-2xl">
                                    {mode === "no_joker" ? (
                                      <span className="text-yellow-100 text-sm font-semibold">No Wild</span>
                                    ) : showRealWildcard ? (
                                      <span className="text-yellow-300 font-extrabold text-3xl">{revealedWildJoker || "?"}</span>
                                    ) : (
                                      <span className="text-slate-200 font-bold text-3xl">?</span>
                                    )}
                                  </div>
                                  <div className="center-pile-label absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-100 bg-black/60 px-3 py-1 rounded-full border border-white/10 whitespace-nowrap">
                                    {label}
                                  </div>
                                </div>
                              );
                            })()}
                              </div>
                            </CasinoTable3D>
                          </div>
                        </div>

                        <div className="desktop-meld-area">
                          <div className="melds-container rummy-meld-band flex flex-wrap justify-center gap-2 lg:gap-4 overflow-x-auto pb-2">
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
                            onWildReveal={(rank) => {
                              setRevealedWildJoker(rank);
                              setShowWildJokerReveal(true);
                            }}
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
                            onWildReveal={(rank) => {
                              setRevealedWildJoker(rank);
                              setShowWildJokerReveal(true);
                            }}
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
                            onWildReveal={(rank) => {
                              setRevealedWildJoker(rank);
                              setShowWildJokerReveal(true);
                            }}
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
                            gameMode={info.wild_joker_mode}
                            onWildReveal={(rank) => {
                              setRevealedWildJoker(rank);
                              setShowWildJokerReveal(true);
                            }}
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
                          <div className="desktop-meld-actions hidden lg:grid">
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
                            {roundHistory.length > 0 && user?.id === info?.host_user_id && !showScoreboardModal && (
                              <Button
                                size="sm"
                                disabled={starting}
                                onClick={onNextRound}
                                className="desktop-next-round-btn bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium shadow-md transition-all active:scale-95"
                              >
                                {starting ? "Starting..." : "Start Next Round"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom: Player Area (Hand only) */}
                      <div className="player-area-section space-y-4">
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
                                className="lg:hidden bg-red-600 hover:bg-red-700 text-white font-medium shadow-md transition-all active:scale-95"
                              >
                                Discard Selected
                              </Button>

                              <Button
                                size="sm"
                                disabled={!isMyTurn}
                                onClick={onDeclare}
                                className="lg:hidden bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-md transition-all active:scale-95 shimmer"
                              >
                                Declare
                              </Button>
                              {roundHistory.length > 0 && user?.id === info?.host_user_id && !showScoreboardModal && (
                                <Button
                                  size="sm"
                                  disabled={starting}
                                  onClick={onNextRound}
                                  className="lg:hidden bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium shadow-md transition-all active:scale-95"
                                >
                                  {starting ? "Starting..." : "Start Next Round"}
                                </Button>
                              )}
                            </div>
                          </div>

                          <HandStrip
                            hand={availableHand}
                            onCardClick={onCardSelect}
                            selectedIndex={selectedCardIndex}
                            highlightIndex={-1}
                            draggedIndexExternal={draggedCardIndex}
                            setDraggedIndexExternal={setDraggedCardIndex}
                            onExternalDrop={(cardIndex, zoneId) => {
                              if (!availableHand || !availableHand[cardIndex]) return;
                              const card = availableHand[cardIndex];
                              if (zoneId.startsWith("meld-")) {
                                const meldIdx = parseInt(zoneId.split("-")[1]);
                                if (!isNaN(meldIdx)) {
                                  const ok = dropHandCardToZone(meldIdx, card);
                                  if (!ok) toast.error("Drop failed: slot full or locked");
                                }
                              } else if (zoneId === "deadwood") {
                                const ok = dropHandCardToZone(4, card);
                                if (!ok) toast.error("Drop failed: deadwood slot full or locked");
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
                                <RummyPlayersList info={info} activeUserId={info.active_user_id} onKickPlayer={handleKickPlayer} />
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
                    <ChatSidebar
                      tableId={tableId}
                      currentUserId={user.id}
                      players={info.players.map((p) => ({ userId: p.user_id, displayName: p.display_name || p.user_id.slice(0, 6), profileImage: p.profile_image_url }))}
                      hideToggleButton={true}
                      openSignal={chatOpenSignal}
                      onUnreadChange={setChatUnreadCount}
                      onClose={() => setChatPanelOpen(false)}
                    />
                  )}

                  {user && info && tableId && (
                    <VoicePanel
                      tableId={tableId}
                      currentUserId={user.id}
                      isHost={info.host_user_id === user.id}
                      players={info.players}
                      hideToggleButton={true}
                      openSignal={voiceOpenSignal}
                      onClose={() => setVoicePanelOpen(false)}
                      onCallStateChange={setInCallActive}
                    />
                  )}

                  <WildJokerRevealModal
                    isOpen={showWildJokerReveal}
                    onClose={() => setShowWildJokerReveal(false)}
                    wildJokerRank={revealedWildJoker || ""}
                  />


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
                    loserDeadwoodMode={info?.loser_deadwood_mode}
                    aceValue={info?.ace_value}
                    faceCardMode={info?.face_card_mode}
                    wildJokerMode={info?.wild_joker_mode}
                    disqualifyScore={info?.disqualify_score}
                    onNextRound={() => {
                      setShowScoreboardModal(false);
                      return onNextRound();
                    }}
                  />

                  <AllRoundsResultsModal
                    isOpen={showAllRoundsModal}
                    onClose={() => setShowAllRoundsModal(false)}
                    roundHistory={roundHistory}
                    players={info?.players || []}
                    disqualifyScore={info?.disqualify_score}
                    loserDeadwoodMode={info?.loser_deadwood_mode}
                    aceValue={info?.ace_value}
                    faceCardMode={info?.face_card_mode}
                    wildJokerMode={info?.wild_joker_mode}
                    onViewRoundDetail={(n) => openRoundScoreboardForRound(n, { closeAllRoundsModal: true })}
                  />

                </div>


                {/* Desktop Sidebar - Table Info with Round History */}
                {tableInfoVisible && (
                  <div className={`hidden lg:block self-start bg-card border border-border rounded-lg shadow-lg order-2 ${tableInfoMinimized ? "w-auto" : ""}`}>
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
                                <RummyPlayersList info={info} activeUserId={info.active_user_id} onKickPlayer={handleKickPlayer} />
                              </div>
                            </div>

                            <div className="border-t border-border pt-3">
                              <p className="text-sm text-muted-foreground">Status: <span className="text-foreground font-medium">{info?.status ?? "-"}</span></p>
                              {info && info.status === "waiting" && user && user.id !== info.host_user_id && (
                                <p className="text-sm text-muted-foreground text-center py-2">Waiting for host to start...</p>
                              )}
                            </div>

                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Mobile/Tablet Popup - Table Info */}
                {tableInfoVisible && (
                  <div className="lg:hidden fixed inset-0 z-[73]">
                    <button
                      type="button"
                      aria-label="Close table info overlay"
                      onClick={() => setTableInfoVisible(false)}
                      className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
                    />
                    <div className="absolute left-3 right-3 top-16 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[72vh]">
                      <div className="flex items-center justify-between p-3 bg-slate-800/80 border-b border-slate-700">
                        <h3 className="text-sm font-semibold text-slate-100">Table Info</h3>
                        <button onClick={() => setTableInfoVisible(false)} className="p-1 hover:bg-slate-700 rounded" title="Close">
                          <X className="w-4 h-4 text-slate-200" />
                        </button>
                      </div>

                      <div className="flex items-center border-b border-slate-700">
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

                      <div className="p-4 space-y-4 overflow-y-auto flex-1">
                        {loading && <p className="text-muted-foreground">Loading…</p>}
                        {!loading && info && activeTab === "info" && (
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
                                <RummyPlayersList info={info} activeUserId={info.active_user_id} onKickPlayer={handleKickPlayer} />
                              </div>
                            </div>
                          </>
                        )}
                        {!loading && info && activeTab === "history" && (
                          <HistoryTable tableId={tableId} />
                        )}
                      </div>
                    </div>
                  </div>
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
            padding-bottom: 26px; /* Safe area + larger cards */
            border-top: 1px solid rgba(255,255,255,0.1);
          }
          .table-3d-container {
             transform: scale(1);
             transform-origin: top center;
             margin-top: 0;
          }
           /* Adjust discard pile visibility */
          .discard-pile-area {
             transform: scale(1);
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



