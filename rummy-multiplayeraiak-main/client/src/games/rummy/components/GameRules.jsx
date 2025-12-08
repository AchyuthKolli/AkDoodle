import React, { useState } from 'react';
import { X, ChevronRight, ChevronDown } from 'lucide-react';

interface Props {
  defaultOpen?: boolean;
}

export const GameRules: React.FC<Props> = ({ defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-32 right-4 z-40 bg-green-800 hover:bg-green-700 text-green-100 px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm"
      >
        <ChevronRight className="w-4 h-4" />
        Game Rules
      </button>
    );
  }

  return (
    <div className="fixed top-32 right-4 z-40 w-80 bg-background border border-border rounded-lg shadow-xl">
      <div className="flex items-center justify-between p-3 border-b border-border bg-green-900/20">
        <h3 className="font-semibold text-green-100 flex items-center gap-2">
          <ChevronDown className="w-4 h-4" />
          13 Card Rummy Rules
        </h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3 text-sm max-h-[60vh] overflow-y-auto">
        <div>
          <h4 className="font-medium text-foreground mb-1">Objective</h4>
          <p className="text-muted-foreground text-xs">
            Arrange your 13 cards into valid sequences and sets, then declare to win the round.
          </p>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-1">Valid Melds</h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-blue-400">•</span>
              <span><strong className="text-blue-400">Pure Sequence:</strong> 3+ consecutive cards of same suit (no jokers). <em className="text-amber-400">Required to declare!</em></span>
            </li>
            <li className="flex gap-2">
              <span className="text-purple-400">•</span>
              <span><strong className="text-purple-400">Impure Sequence:</strong> 3+ consecutive cards, jokers allowed.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-purple-400">•</span>
              <span><strong className="text-purple-400">Set:</strong> 3-4 cards of same rank, different suits.</span>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-1">Turn Flow</h4>
          <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
            <li>Draw 1 card (from stock or discard pile)</li>
            <li>Arrange cards into melds if needed</li>
            <li>Discard 1 card</li>
            <li>If you have valid melds, click "Declare" to win</li>
          </ol>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-1">Declaration Rules</h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• Must have at least 1 pure sequence</li>
            <li>• Must have at least 2 total sequences/sets</li>
            <li>• All 13 cards must be in valid melds</li>
          </ul>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-1">Scoring</h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• Winner scores 0 points</li>
            <li>• Others score sum of ungrouped cards (max 80)</li>
            <li>• A, K, Q, J = 10 points each</li>
            <li>• Number cards = face value</li>
            <li>• Jokers = 0 points</li>
          </ul>
        </div>

        <div className="bg-amber-900/20 border border-amber-700/50 rounded p-2">
          <p className="text-xs text-amber-200">
            <strong>Disqualification:</strong> First player to reach the target score (default 200) is eliminated.
          </p>
        </div>
      </div>
    </div>
  );
};
