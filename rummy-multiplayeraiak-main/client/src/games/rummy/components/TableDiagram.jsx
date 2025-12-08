import React from "react";
import type { PlayerInfo } from "../apiclient/data-contracts";
import { User2 } from "lucide-react";

export interface Props {
  players: PlayerInfo[];
  activeUserId?: string | null;
  currentUserId?: string;
}

export const TableDiagram: React.FC<Props> = ({ players, activeUserId, currentUserId }) => {
  // Position players around the table perimeter in a circular pattern
  const getSeatPosition = (seat: number, totalSeats: number) => {
    // Calculate angle for circular positioning
    const angleStep = 360 / totalSeats;
    const angle = angleStep * (seat - 1) - 90; // Start from top (12 o'clock)
    
    // Convert polar to cartesian coordinates
    const radius = 45; // % from center
    const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
    const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
    
    return { x, y, angle };
  };

  return (
    <div className="relative w-full h-full">
      {/* Player positions around the table */}
      {players.map((player) => {
        const { x, y } = getSeatPosition(player.seat, players.length);
        const isActive = player.user_id === activeUserId;
        const isCurrent = player.user_id === currentUserId;

        return (
          <div
            key={player.user_id}
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className={`
              flex flex-col items-center gap-2 p-3 rounded-xl transition-all backdrop-blur-sm
              ${
                isActive
                  ? "bg-amber-500/40 border-3 border-amber-400 ring-4 ring-amber-400/50 shadow-xl shadow-amber-400/50"
                  : "bg-green-900/60 border-2 border-green-700/80"
              }
              ${
                isCurrent
                  ? "shadow-lg shadow-green-400/50"
                  : ""
              }
            `}>
              <div className={`
                w-14 h-14 rounded-full flex items-center justify-center border-2 overflow-hidden
                ${
                  isActive
                    ? "bg-amber-500 border-amber-300"
                    : "bg-green-700 border-green-600"
                }
              `}>
                {player.profile_image_url ? (
                  <img 
                    src={player.profile_image_url} 
                    alt={player.display_name || 'Player'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User2 className="w-7 h-7 text-white" />
                )}
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-white truncate max-w-[80px] drop-shadow">
                  {isCurrent ? "You" : player.display_name?.slice(0, 10) || `Player ${player.seat}`}
                </div>
                <div className="text-xs text-green-200 font-medium">Seat {player.seat}</div>
              </div>
              {isActive && (
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-amber-400 rounded-full animate-pulse border-2 border-white" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
