import React from "react";

/** Short label for the table setting. */
export function LoserScoringModeLabel({ mode }) {
  const m = String(mode || "auto_optimal").toLowerCase();
  if (m === "submit_or_full") return "Strict — submit or full hand";
  return "Auto + meld board";
}

/**
 * Full rules copy for Create Table and Round Results scoreboard.
 * `currentMode` optional: highlights which mode this table uses.
 */
export function LoserScoringRulesHelp({ currentMode }) {
  const m = String(currentMode || "").toLowerCase();
  const isStrict = m === "submit_or_full";

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

      <section>
        <h4 className="font-semibold text-emerald-300 mb-1.5">Auto + meld board (auto_optimal)</h4>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-xs sm:text-sm">
          <li>Only meld slots that actually contain cards are checked (empty Meld 1–4 slots are ignored).</li>
          <li>If a slot is a valid pure sequence, impure sequence, or set → that slot adds 0 points.</li>
          <li>If a slot is not a valid meld (including only 1–2 cards) → every card in that slot counts toward points.</li>
          <li>
            Cards you put only in the <strong className="text-slate-300">leftover / deadwood</strong> area, plus any
            cards still not placed on the meld board in the saved layout, are taken together: the server looks for
            legal melds among them (greedy “auto”); only what cannot be placed in any valid meld still counts.
          </li>
          <li>During the round your meld board is synced to the server periodically so this layout can be used.</li>
        </ol>
      </section>

      <section>
        <h4 className="font-semibold text-sky-300 mb-1.5">Strict — submit or full hand (submit_or_full)</h4>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-xs sm:text-sm">
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
