import React, { useState } from "react";
import { LoserScoringRulesHelp } from "./LoserScoringRulesHelp.jsx";
import { normalizeLoserScoringMode } from "../utils/loserScoringMode.js";
import { normalizeWildMode } from "../utils/wildJokerMode.js";

function wildModeLabel(mode) {
  const m = normalizeWildMode(mode);
  if (m === "no_joker") return "No wild card";
  if (m === "closed_joker") return "Closed wild card";
  return "Open wild card";
}

/**
 * Loser-scoring help + admin table settings (same rules for the whole table).
 * Used on the per-round scoreboard and on the all-rounds summary modal.
 */
export function AdminTableRulesPanel({
  loserDeadwoodMode,
  aceValue,
  faceCardMode,
  wildJokerMode,
  disqualifyScore,
  /** Shown under the amber box, e.g. "These settings apply to every round on this table." */
  footnote,
}) {
  const [showLoserRulesInfo, setShowLoserRulesInfo] = useState(false);

  const modeLabel = normalizeLoserScoringMode(loserDeadwoodMode) === "submit_or_full"
    ? "Strict (submit_or_full)"
    : "Auto + meld board (auto_optimal)";
  const aceLabel = aceValue === 1 ? "A=1" : "A=10";
  const faceLabel = String(faceCardMode || "ten").toLowerCase() === "rank"
    ? "J=11, Q=12, K=13"
    : "J=10, Q=10, K=10";

  const limit =
    disqualifyScore != null && Number.isFinite(Number(disqualifyScore))
      ? Number(disqualifyScore)
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-600/50 bg-slate-800/50 text-left">
        <div className="px-3 py-2.5 flex items-center gap-2 text-sm font-medium text-slate-200">
          <span>How loser points work on this table</span>
          <button
            type="button"
            onClick={() => setShowLoserRulesInfo((v) => !v)}
            className="text-base leading-none hover:scale-110 transition-transform"
            aria-label="Show loser scoring explanation"
            title="Show full explanation"
          >
            ℹ️
          </button>
        </div>
        {showLoserRulesInfo && (
          <div className="px-3 pb-4 pt-1 border-t border-slate-700/60">
            <LoserScoringRulesHelp currentMode={loserDeadwoodMode} aceValue={aceValue} faceCardMode={faceCardMode} />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-700/45 bg-amber-950/20 p-3">
        <p className="text-xs font-semibold text-amber-300 mb-2">Admin selected for this table</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
          <p><span className="text-slate-400">Loser mode:</span> {modeLabel}</p>
          <p><span className="text-slate-400">Ace value:</span> {aceLabel}</p>
          <p><span className="text-slate-400">Face cards:</span> {faceLabel}</p>
          <p><span className="text-slate-400">Declare count:</span> 4 melds (3+3+3+4), 1 pure required</p>
          <p><span className="text-slate-400">Wild card:</span> {wildModeLabel(wildJokerMode)}</p>
          {limit != null && (
            <p><span className="text-slate-400">Disqualify at:</span> {limit} pts (cumulative)</p>
          )}
        </div>
        {footnote ? (
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{footnote}</p>
        ) : null}
      </div>
    </div>
  );
}
