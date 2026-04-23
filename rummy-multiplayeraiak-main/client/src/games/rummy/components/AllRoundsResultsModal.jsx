import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { BarChart3, Crown } from "lucide-react";
import { AdminTableRulesPanel } from "./AdminTableRulesPanel.jsx";

/**
 * Cumulative scores across completed rounds (R1, R2, … and running total).
 * Separate from the per-round scoreboard (melds / cards) in ScoreboardModal.
 */
export function AllRoundsResultsModal({
  isOpen,
  onClose,
  roundHistory = [],
  players = [],
  disqualifyScore,
  loserDeadwoodMode,
  aceValue,
  faceCardMode,
  wildJokerMode,
  onViewRoundDetail,
}) {
  const rounds = roundHistory || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-600/50 shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl text-slate-100">
            <BarChart3 className="w-7 h-7 text-cyan-400" />
            All round results
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-400 -mt-2 mb-3">
          Running totals for every completed round. Refreshes when you open this window or after each round ends.
          {onViewRoundDetail
            ? " Tap a round column (R1, R2, …) to open that round's card breakdown in the round scoreboard."
            : null}
        </p>

        <AdminTableRulesPanel
          loserDeadwoodMode={loserDeadwoodMode}
          aceValue={aceValue}
          faceCardMode={faceCardMode}
          wildJokerMode={wildJokerMode}
          disqualifyScore={disqualifyScore}
          footnote="These are the host's table settings. They stay the same for every round on this table."
        />

        {!rounds.length ? (
          <p className="text-sm text-slate-500 py-6 text-center">No completed rounds yet.</p>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 mt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-2 font-semibold text-slate-200">Player</th>
                    {rounds.map((round) => (
                      <th key={round.round_number} className="text-center py-2 px-1 font-semibold text-slate-200">
                        {onViewRoundDetail ? (
                          <button
                            type="button"
                            onClick={() => onViewRoundDetail(round.round_number)}
                            className="px-1.5 py-0.5 rounded text-cyan-200 hover:bg-slate-700/80 transition-colors"
                            title={`Open round ${round.round_number} scoreboard (cards & melds)`}
                          >
                            R{round.round_number}
                          </button>
                        ) : (
                          <span className="text-slate-300">R{round.round_number}</span>
                        )}
                      </th>
                    ))}
                    <th className="text-right py-2 px-2 font-semibold text-yellow-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(players || []).map((player) => {
                    let runningTotal = 0;
                    return (
                      <tr key={player.user_id} className="border-b border-slate-800/80">
                        <td className="py-2 px-2 text-slate-200">
                          {player.display_name || "Player"}
                        </td>
                        {rounds.map((round) => {
                          const roundScore = Number(round?.scores?.[player.user_id] || 0);
                          runningTotal += roundScore;
                          const isRoundWinner =
                            round?.status !== "invalid" &&
                            round?.winner_user_id != null &&
                            String(round.winner_user_id) === String(player.user_id);
                          return (
                            <td
                              key={`${player.user_id}-${round.round_number}`}
                              className="text-center py-2 px-1 text-slate-300"
                            >
                              <span className="inline-flex items-center justify-center gap-1">
                                {roundScore}
                                {isRoundWinner && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                              </span>
                            </td>
                          );
                        })}
                        <td className="text-right py-2 px-2 font-semibold text-yellow-500">
                          {runningTotal}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button type="button" onClick={onClose} className="bg-slate-600 hover:bg-slate-500">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
