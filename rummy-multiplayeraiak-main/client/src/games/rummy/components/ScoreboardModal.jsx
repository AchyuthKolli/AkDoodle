import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy, Crown, ChevronDown, ChevronUp } from "lucide-react";

// FIXED PATH – now from games/rummy/components
import { PlayingCard } from "./PlayingCard";

// FIXED PATH – now from apiclient
import type { RevealedHandsResponse } from "../../../apiclient/data-contracts";
import apiclient from "../../../apiclient";

import { toast } from "sonner";

export interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: RevealedHandsResponse | null;
  players: Array<{ user_id: string; display_name?: string | null; profile_image_url?: string | null }>;
  currentUserId: string;
  tableId: string;
  hostUserId: string;
  onNextRound?: () => void;
}

export const ScoreboardModal: React.FC<Props> = ({
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
    .sort((a, b) => a.score - b.score);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const togglePlayer = (uid: string) =>
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
    } catch (error: any) {
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
              {winnerName} wins with {sortedPlayers[0]?.score || 0} points!
            </div>
          </div>

          <div className="space-y-4">
            {sortedPlayers.map((p, idx) => (
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
                      {p.score} pts
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
                    {p.organized?.pure_sequences?.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-emerald-400 mb-1">
                          PURE SEQUENCES
                        </div>
                        <div className="space-y-2">
                          {p.organized.pure_sequences.map(
                            (meld: any[], mIdx: number) => (
                              <div
                                key={mIdx}
                                className="border border-emerald-600/40 bg-emerald-950/30 rounded-lg p-2"
                              >
                                <div className="flex gap-1 flex-wrap">
                                  {meld.map((c: any, idx: number) => (
                                    <div key={idx} className="transform scale-75 origin-top-left">
                                      <PlayingCard card={c} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {p.organized?.impure_sequences?.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-blue-400 mb-1">
                          IMPURE SEQUENCES
                        </div>
                        <div className="space-y-2">
                          {p.organized.impure_sequences.map(
                            (meld: any[], mIdx: number) => (
                              <div
                                key={mIdx}
                                className="border border-blue-600/40 bg-blue-950/30 rounded-lg p-2"
                              >
                                <div className="flex gap-1 flex-wrap">
                                  {meld.map((c: any, idx: number) => (
                                    <div key={idx} className="transform scale-75 origin-top-left">
                                      <PlayingCard card={c} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {p.organized?.sets?.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-purple-400 mb-1">
                          SETS
                        </div>
                        <div className="space-y-2">
                          {p.organized.sets.map((meld: any[], mIdx: number) => (
                            <div
                              key={mIdx}
                              className="border border-purple-600/40 bg-purple-950/30 rounded-lg p-2"
                            >
                              <div className="flex gap-1 flex-wrap">
                                {meld.map((c: any, idx: number) => (
                                  <div key={idx} className="transform scale-75 origin-top-left">
                                    <PlayingCard card={c} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {p.organized?.ungrouped?.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-red-400 mb-1">
                          DEADWOOD (Ungrouped)
                        </div>
                        <div className="border border-red-600/40 bg-red-950/30 rounded-lg p-2">
                          <div className="flex gap-1 flex-wrap">
                            {p.organized.ungrouped.map((c: any, idx: number) => (
                              <div key={idx} className="transform scale-75 origin-top-left">
                                <PlayingCard card={c} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {!p.organized && (
                      <div className="flex gap-1 flex-wrap">
                        {p.rawCards.map((c: any, idx: number) => (
                          <div key={idx} className="transform scale-75 origin-top-left">
                            <PlayingCard card={c} />
                          </div>
                        ))}
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
