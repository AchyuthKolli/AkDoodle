import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Trophy, Crown, ChevronDown, ChevronUp, Check, X } from "lucide-react";

import PlayingCard from "./PlayingCard";
import { LoserScoringRulesHelp } from "./LoserScoringRulesHelp.jsx";

import { toast } from "sonner";

const uidKey = (id) => (id == null ? "" : String(id));

const SLOT_STYLES = {
  pure: "border-emerald-600/50 bg-emerald-950/25",
  impure: "border-blue-600/50 bg-blue-950/25",
  set: "border-purple-600/50 bg-purple-950/25",
  invalid: "border-red-600/55 bg-red-950/30",
  empty: "border-slate-600/40 bg-slate-900/40",
};

function slotClass(kind) {
  return SLOT_STYLES[kind] || SLOT_STYLES.empty;
}

function MeldRow({ label, cards, kind, cardKeyPrefix }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
      <span className="text-xs font-semibold text-slate-400 w-24 shrink-0 pt-2">{label}</span>
      <div className={`flex-1 rounded-lg border p-2 min-h-[72px] ${slotClass(kind)}`}>
        <div className="flex gap-1 flex-wrap items-center">
          {(cards || []).length ? (
            (cards || []).map((c, idx) => (
              <div
                key={`${cardKeyPrefix}-${idx}-${c?.rank}-${c?.suit}-${c?.joker ? "j" : ""}`}
                className="transform scale-75 origin-top-left -mr-4 last:mr-0"
              >
                <PlayingCard card={c} />
              </div>
            ))
          ) : (
            <span className="text-slate-500 text-sm italic px-1">Empty</span>
          )}
        </div>
      </div>
    </div>
  );
}

export const ScoreboardModal = ({
  isOpen,
  onClose,
  data,
  players,
  currentUserId,
  tableId,
  hostUserId,
  onNextRound,
  loserDeadwoodMode,
}) => {
  const [startingNextRound, setStartingNextRound] = useState(false);
  const [expanded, setExpanded] = useState({});

  if (!data) return null;

  const isHost = uidKey(currentUserId) === uidKey(hostUserId);
  const rawScores = data.scores && typeof data.scores === "object" ? data.scores : {};
  const rawRevealed = data.revealed_hands && typeof data.revealed_hands === "object" ? data.revealed_hands : {};
  const rawOrganized = data.organized_melds && typeof data.organized_melds === "object" ? data.organized_melds : {};

  const safeScores = {};
  for (const [k, v] of Object.entries(rawScores)) safeScores[uidKey(k)] = v;

  const safeRevealedHands = {};
  for (const [k, v] of Object.entries(rawRevealed)) safeRevealedHands[uidKey(k)] = v;

  const safeOrganized = {};
  for (const [k, v] of Object.entries(rawOrganized)) safeOrganized[uidKey(k)] = v;

  const declaredBy = data.declared_by != null ? uidKey(data.declared_by) : null;

  const sortedPlayers = (players || [])
    .filter((p) => safeScores[uidKey(p.user_id)] !== undefined)
    .map((p) => {
      const id = uidKey(p.user_id);
      return {
        ...p,
        user_id: id,
        score: safeScores[id],
        organized: safeOrganized[id] || null,
        rawCards: safeRevealedHands[id] || [],
        isWinner: id === uidKey(data.winner_user_id),
        isDeclarer: declaredBy && id === declaredBy,
      };
    })
    .sort((a, b) => {
      const scoreA = typeof a.score === "object" && a.score !== null ? a.score.points : a.score;
      const scoreB = typeof b.score === "object" && b.score !== null ? b.score.points : b.score;
      return scoreA - scoreB;
    });

  const togglePlayer = (uid) =>
    setExpanded((prev) => ({ ...prev, [uid]: !prev[uid] }));

  const winnerName =
    sortedPlayers.find((p) => p.isWinner)?.display_name || "Winner";

  const handleStartNextRound = async () => {
    setStartingNextRound(true);
    try {
      if (onNextRound) {
        await onNextRound();
      }
      toast.success("Starting next round...");
      onClose();
    } catch (error) {
      toast.error(error?.error?.detail || "Failed to start next round");
    } finally {
      setStartingNextRound(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-amber-600/40 shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl text-amber-400">
            <Trophy className="w-8 h-8 text-yellow-400" />
            Round {data.round_number} Results
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="bg-gradient-to-r from-yellow-900/40 to-amber-900/40 border border-yellow-600/40 rounded-lg p-4 text-center shadow-md">
            <div className="flex items-center justify-center gap-2 text-xl font-bold text-yellow-300 drop-shadow">
              <Crown className="w-6 h-6" />
              {data.status === "invalid" ? (
                <span>Invalid declaration! Declarer penalised 20 pts. No winner this round.</span>
              ) : (
                <span>
                  {winnerName} wins with{" "}
                  {(() => {
                    const s = sortedPlayers[0]?.score;
                    return typeof s === "object" && s !== null ? (s.points || 0) : (s || 0);
                  })()}{" "}
                  points!
                </span>
              )}
            </div>
          </div>

          <details className="group rounded-lg border border-slate-600/50 bg-slate-800/50 text-left">
            <summary className="cursor-pointer select-none list-none flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700/40 rounded-lg [&::-webkit-details-marker]:hidden">
              <ChevronDown className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              How loser points work this round (click for full explanation)
            </summary>
            <div className="px-3 pb-4 pt-1 border-t border-slate-700/60 max-h-[min(380px,50vh)] overflow-y-auto">
              <LoserScoringRulesHelp currentMode={loserDeadwoodMode} />
            </div>
          </details>

          <div className="space-y-4">
            {sortedPlayers.map((p, idx) => {
              const o = p.organized;
              const kinds = (o && o.slot_kind) || [null, null, null, null];
              const handRemainder = (o && (o.hand_remainder ?? o.ungrouped)) || [];
              const deadwood = (o && o.deadwood) || [];

              return (
                <div
                  key={p.user_id}
                  className={`rounded-lg border p-4 transition-all ${
                    p.isWinner
                      ? "bg-yellow-950/20 border-yellow-600/60 shadow-lg shadow-yellow-600/20"
                      : "bg-slate-800/50 border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-400 bg-slate-700">
                        {p.profile_image_url ? (
                          <img
                            src={p.profile_image_url}
                            alt={p.display_name || "Player"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <Crown className="w-5 h-5 opacity-50" />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.isWinner && <Crown className="w-5 h-5 text-yellow-400" />}
                          <span className="font-semibold text-lg text-slate-200">
                            {idx + 1}. {p.display_name || p.user_id.slice(0, 6)}
                          </span>
                          {p.user_id === uidKey(currentUserId) && (
                            <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-1 rounded">You</span>
                          )}
                          {p.isDeclarer && (
                            <span className="text-xs bg-amber-700/40 text-amber-200 px-2 py-1 rounded border border-amber-600/50">
                              Declared
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold text-amber-400">
                        {typeof p.score === "object" && p.score !== null ? (p.score.points || 0) : p.score} pts
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePlayer(p.user_id)}
                        className="p-1 rounded bg-slate-700/40 hover:bg-slate-600/50 transition"
                      >
                        {expanded[p.user_id] ? (
                          <ChevronUp className="w-5 h-5 text-slate-200" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-200" />
                        )}
                      </button>
                    </div>
                  </div>

                  {expanded[p.user_id] && (
                    <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                      {o ? (
                        <div className="space-y-3">
                          <p className="text-xs text-slate-500 leading-relaxed">
                            <strong className="text-slate-400">Declarer:</strong> your four submitted groups are checked
                            per rule (pure / impure / set / invalid). <strong className="text-slate-400">Others:</strong>{" "}
                            we only find rule-valid melds inside your real 13 cards — your on-screen slots are not sent
                            to the server. <strong className="text-slate-400">Loser points:</strong> only cards outside
                            those valid melds count (fake melds never reduce points).{" "}
                            <strong className="text-slate-400">Closed joker:</strong> the wild rank acts as a joker only
                            after someone locks a pure sequence; printed jokers stay 0 in deadwood.
                          </p>
                          <MeldRow
                            label="Meld 1"
                            cards={o.meld1}
                            kind={kinds[0]}
                            cardKeyPrefix={`${p.user_id}-m1`}
                          />
                          <MeldRow
                            label="Meld 2"
                            cards={o.meld2}
                            kind={kinds[1]}
                            cardKeyPrefix={`${p.user_id}-m2`}
                          />
                          <MeldRow
                            label="Meld 3"
                            cards={o.meld3}
                            kind={kinds[2]}
                            cardKeyPrefix={`${p.user_id}-m3`}
                          />
                          <MeldRow
                            label="Meld 4"
                            cards={o.meld4}
                            kind={kinds[3]}
                            cardKeyPrefix={`${p.user_id}-m4`}
                          />

                          <div className="bg-red-950/10 p-3 rounded-lg border border-red-900/30">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="text-sm font-bold text-red-300 flex items-center gap-2">
                                <X className="w-4 h-4" /> Deadwood (discard / not in meld slots)
                              </h4>
                            </div>
                            <div className="border border-red-700/30 bg-red-900/10 rounded-lg p-3 min-h-[64px]">
                              <div className="flex gap-1 flex-wrap">
                                {deadwood.length ? (
                                  deadwood.map((c, i) => (
                                    <div
                                      key={`${p.user_id}-dw-${i}-${c?.rank}-${c?.suit}`}
                                      className="transform scale-75 origin-top-left -mr-4 last:mr-0"
                                    >
                                      <PlayingCard card={c} />
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-slate-500 text-sm italic">None</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600/40">
                            <h4 className="text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                              Cards still in hand (not in auto-melds)
                            </h4>
                            <div className="flex gap-1 flex-wrap min-h-[64px]">
                              {handRemainder.length ? (
                                handRemainder.map((c, i) => (
                                  <div
                                    key={`${p.user_id}-hr-${i}-${c?.rank}-${c?.suit}`}
                                    className="transform scale-75 origin-top-left -mr-4 last:mr-0"
                                  >
                                    <PlayingCard card={c} />
                                  </div>
                                ))
                              ) : (
                                <span className="text-emerald-500/90 text-sm italic flex items-center gap-2">
                                  <Check className="w-4 h-4" /> None left outside melds
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-900/50 p-4 rounded-lg">
                          <h4 className="text-sm font-bold text-slate-400 mb-2">Unorganized hand</h4>
                          <div className="flex gap-1 flex-wrap">
                            {p.rawCards.map((c, idx) => (
                              <div
                                key={`${p.user_id}-raw-${idx}-${c?.rank}-${c?.suit}`}
                                className="transform scale-75 origin-top-left -mr-4"
                              >
                                <PlayingCard card={c} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 justify-end">
            {isHost && (
              <Button
                onClick={handleStartNextRound}
                disabled={startingNextRound}
                className="bg-green-600 hover:bg-green-700 font-semibold"
              >
                {startingNextRound ? "Starting..." : "Start Next Round"}
              </Button>
            )}

            <Button onClick={onClose} className="bg-amber-600 hover:bg-amber-700 text-white">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
