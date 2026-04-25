import React from "react";
import { isStrictLoserScoringMode, normalizeLoserScoringMode } from "../utils/loserScoringMode.js";

/** Short label for the table setting. */
export function LoserScoringModeLabel({ mode }) {
  const m = normalizeLoserScoringMode(mode);
  if (m === "submit_or_full") return "Strict — submit or full hand";
  return "Auto + meld board";
}

/**
 * Full rules copy for Create Table and Round Results scoreboard.
 * `currentMode` optional: highlights which mode this table uses.
 */
export function LoserScoringRulesHelp({ currentMode, aceValue, faceCardMode }) {
  const m = normalizeLoserScoringMode(currentMode);
  const isStrict = isStrictLoserScoringMode(m);
  const hasAceSetting = aceValue === 1 || aceValue === 10;
  const faceMode = String(faceCardMode || "ten").toLowerCase() === "rank" ? "rank" : "ten";

  return (
    <div className="space-y-4 text-left text-sm leading-relaxed text-slate-300">
      <p className="text-slate-400 text-xs">
        When someone wins the round with a <strong className="text-slate-200">valid declare</strong>, each other
        player’s <strong className="text-slate-200">round penalty</strong> is computed from their real{" "}
        <strong className="text-slate-200">13 cards</strong>, using the same wild-card and closed-joker rules as play.
        The scoreboard shows cards in meld slots for clarity; <strong className="text-slate-200">numbers in “pts”</strong>{" "}
        follow the table’s loser mode below.
      </p>

      {currentMode ? (
        <p className="text-xs text-amber-100/95 border border-amber-600/40 rounded-md px-3 py-2 bg-amber-950/35">
          This table is set to:{" "}
          <strong className="text-amber-200">
            {isStrict ? "Strict (submit_or_full)" : "Auto + meld board (auto_optimal)"}
          </strong>
        </p>
      ) : null}

      {(hasAceSetting || faceCardMode) ? (
        <p className="text-xs text-slate-300 border border-slate-600/60 rounded-md px-3 py-2 bg-slate-900/45">
          Point map used by both Auto and Strict:{" "}
          <strong className="text-slate-100">A={hasAceSetting ? aceValue : 10}</strong>,{" "}
          <strong className="text-slate-100">
            {faceMode === "rank" ? "J=11, Q=12, K=13" : "J=10, Q=10, K=10"}
          </strong>.
          Only grouping logic differs between Auto and Strict; card values stay the same for the table.
        </p>
      ) : null}

      <section>
        <h4 className="font-semibold text-emerald-300 mb-1.5">Auto + meld board (auto_optimal)</h4>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-xs sm:text-sm">
          <li>
            After a valid declare, each active loser&apos;s <strong className="text-slate-300">entire 13-card hand</strong> is
            checked first: if the cards can be split into a legal winning shape (four melds 3+3+3+4 with at least one pure
            sequence, same rules as declare), that layout scores <strong className="text-slate-300">0</strong> for the round.
            Your on-table arrangement does not lock you into a worse score.
          </li>
          <li>
            If no such full-hand layout exists, scoring falls back to: valid filled meld slots → 0; invalid slots → those
            cards count; leftover + unplaced cards → greedy auto-melds then pay the rest (same as before).
          </li>
          <li>During play your meld board is still synced for the fallback path and for the scoreboard display.</li>
        </ol>
        <div className="mt-2 rounded-md border border-emerald-700/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100/95">
          <strong className="text-emerald-200">Beginner tip:</strong> new players who are unsure how to arrange melds
          still get a fair penalty in Auto — the server optimizes all 13 cards when a perfect split exists.
        </div>
      </section>

      <section>
        <h4 className="font-semibold text-sky-300 mb-1.5">Strict — submit or full hand (submit_or_full, default)</h4>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-xs sm:text-sm">
          <li>
            After a valid declare, each loser gets <strong className="text-slate-300">60 seconds</strong> to arrange cards on
            the meld board. A countdown runs on screen; tap <strong className="text-slate-300">Done</strong> when finished.
            When every loser has Done, scoring runs immediately (you do not have to wait the full 60 seconds).
          </li>
          <li>Same slot rules: valid meld slots → 0; invalid slots → all cards in those slots count.</li>
          <li>
            Cards not placed on the meld board in the saved layout, and cards only in the leftover slot, count at{" "}
            <strong className="text-slate-300">full</strong> face value — there is <strong className="text-slate-300">no</strong>{" "}
            automatic meld reduction on that pile.
          </li>
          <li>
            If there is no saved layout or it does not match your hand, the penalty uses{" "}
            <strong className="text-slate-300">all 13 cards</strong> (full hand).
          </li>
        </ol>
        <div className="mt-2 rounded-md border border-sky-700/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-100/95">
          <strong className="text-sky-200">Strict vs Auto:</strong> Strict rewards deliberate arrangement and gives you
          time to fix your board; Auto helps beginners by optimizing the full hand when the rules allow it.
        </div>
      </section>

      <section>
        <h4 className="font-semibold text-slate-200 mb-1.5">Scoreboard vs points</h4>
        <p className="text-slate-400 text-xs sm:text-sm">
          The declarer’s rows reflect what they <strong className="text-slate-300">submitted on declare</strong>. Other
          players’ rows show meld slots for reading; their “pts” for the round still come from the rules above (and
          capped at 80 where the game applies that cap).
        </p>
      </section>
    </div>
  );
}
