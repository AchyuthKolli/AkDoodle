import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Trophy, Crown, ChevronDown, ChevronUp, Check, X } from "lucide-react";

// FIXED PATH – now from games/rummy/components
import PlayingCard from "./PlayingCard";

// FIXED PATH – now from apiclient
import apiclient from "../../../apiclient";

import { toast } from "sonner";

export const ScoreboardModal = ({
  isOpen,
  onClose,
  data,
  players,
  currentUserId,
  tableId,
  hostUserId,
  onNextRound,
}) => {
  const [startingNextRound, setStartingNextRound] = useState(false);

  if (!data) return null;

  const isHost = currentUserId === hostUserId;

  const sortedPlayers = players
    .filter((p) => data.scores[p.user_id] !== undefined)
    .map((p) => ({
      ...p,
      score: data.scores[p.user_id],
      organized: data.organized_melds?.[p.user_id] || null,
      rawCards: data.revealed_hands[p.user_id] || [],
      isWinner: p.user_id === data.winner_user_id,
    }))
    .sort((a, b) => {
      const scoreA = typeof a.score === "object" && a.score !== null ? a.score.points : a.score;
      const scoreB = typeof b.score === "object" && b.score !== null ? b.score.points : b.score;
      return scoreA - scoreB;
    });

  const [expanded, setExpanded] = useState({});
  const togglePlayer = (uid) =>
    setExpanded((prev) => ({ ...prev, [uid]: !prev[uid] }));

  const winnerName =
    sortedPlayers.find((p) => p.isWinner)?.display_name || "Winner";

  const handleStartNextRound = async () => {
    setStartingNextRound(true);
    try {
      await apiclient.start_next_round({ table_id: tableId });
      toast.success("Starting next round...");
      onClose();
      onNextRound && onNextRound();
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
                <span>Invalid Declaration! Declarer penalised 80 pts.</span>
              ) : (
                <span>
                  {winnerName} wins with {
                    (() => {
                      const s = sortedPlayers[0]?.score;
                      return typeof s === "object" && s !== null ? (s.points || 0) : (s || 0);
                    })()
                  } points!
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {sortedPlayers.map((p, idx) => (
              <div
                key={p.user_id}
                className={`rounded-lg border p-4 transition-all ${p.isWinner
                  ? "bg-yellow-950/20 border-yellow-600/60 shadow-lg shadow-yellow-600/20"
                  : "bg-slate-800/50 border-slate-700"
                  }`}
              >
                {/* ... existing header ... */}
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
                      <div className="flex items-center gap-2">
                        {p.isWinner && <Crown className="w-5 h-5 text-yellow-400" />}
                        <span className="font-semibold text-lg text-slate-200">
                          {idx + 1}. {p.display_name || p.user_id.slice(0, 6)}
                        </span>
                        {p.user_id === currentUserId && (
                          <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-1 rounded">
                            You
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
                  <div className="mt-4 space-y-4 border-t border-slate-700 pt-4">
                    {/* Organized View */}
                    {p.organized ? (
                      <div className="grid grid-cols-1 gap-4">
                        {/* VALID MELDS SECTION */}
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-emerald-900/30">
                          <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                            <Check className="w-4 h-4" /> Valid Melds
                          </h4>
                          <div className="space-y-3">
                            {/* Pure Sequences */}
                            {p.organized.pure_sequences?.map((meld, mIdx) => (
                              <div key={`pure-${mIdx}`} className="flex items-center gap-3">
                                <span className="text-xs text-emerald-500/80 font-mono w-16 uppercase">Pure Seq</span>
                                <div className="border border-emerald-600/40 bg-emerald-950/30 rounded-lg p-2 flex-1">
                                  <div className="flex gap-1 flex-wrap">
                                    {meld.map((c, idx) => (
                                      <div key={idx} className="transform scale-75 origin-top-left -mr-4 last:mr-0">
                                        <PlayingCard card={c} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Impure Sequences */}
                            {p.organized.impure_sequences?.map((meld, mIdx) => (
                              <div key={`impure-${mIdx}`} className="flex items-center gap-3">
                                <span className="text-xs text-blue-500/80 font-mono w-16 uppercase">Impure</span>
                                <div className="border border-blue-600/40 bg-blue-950/30 rounded-lg p-2 flex-1">
                                  <div className="flex gap-1 flex-wrap">
                                    {meld.map((c, idx) => (
                                      <div key={idx} className="transform scale-75 origin-top-left -mr-4 last:mr-0">
                                        <PlayingCard card={c} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Sets */}
                            {p.organized.sets?.map((meld, mIdx) => (
                              <div key={`set-${mIdx}`} className="flex items-center gap-3">
                                <span className="text-xs text-purple-500/80 font-mono w-16 uppercase">Set</span>
                                <div className="border border-purple-600/40 bg-purple-950/30 rounded-lg p-2 flex-1">
                                  <div className="flex gap-1 flex-wrap">
                                    {meld.map((c, idx) => (
                                      <div key={idx} className="transform scale-75 origin-top-left -mr-4 last:mr-0">
                                        <PlayingCard card={c} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}

                            {(!p.organized.pure_sequences?.length && !p.organized.impure_sequences?.length && !p.organized.sets?.length) && (
                              <div className="text-slate-500 text-sm italic px-2">No valid melds formed.</div>
                            )}
                          </div>
                        </div>

                        {/* HAND / DEADWOOD SECTION */}
                        <div className="bg-red-950/10 p-3 rounded-lg border border-red-900/30">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-red-400 flex items-center gap-2">
                              <X className="w-4 h-4" /> Remaining Hand (Deadwood)
                            </h4>
                            <span className="text-xs bg-red-900/40 text-red-200 px-2 py-1 rounded border border-red-800/50">
                              Penalty Points: {typeof p.score === "object" && p.score !== null ? (p.score.points || 0) : p.score}
                            </span>
                          </div>

                          <div className="border border-red-700/30 bg-red-900/10 rounded-lg p-3 min-h-[100px]">
                            <div className="flex gap-1 flex-wrap">
                              {(p.organized.ungrouped || p.organized.deadwood || []).map((c, idx) => (
                                <div key={idx} className="transform scale-75 origin-top-left -mr-4 last:mr-0 relative group">
                                  <PlayingCard card={c} />
                                  {/* Tooltip for card point? Optional */}
                                </div>
                              ))}
                              {!(p.organized.ungrouped?.length || p.organized.deadwood?.length) && (
                                <div className="text-emerald-500 text-sm italic flex items-center gap-2">
                                  <Check className="w-4 h-4" /> All cards melded!
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* RAW VIEW (Fallback) */
                      <div className="bg-slate-900/50 p-4 rounded-lg">
                        <h4 className="text-sm font-bold text-slate-400 mb-2">Unorganized Hand</h4>
                        <div className="flex gap-1 flex-wrap">
                          {p.rawCards.map((c, idx) => (
                            <div key={idx} className="transform scale-75 origin-top-left -mr-4">
                              <PlayingCard card={c} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
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

            <Button
              onClick={onClose}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
