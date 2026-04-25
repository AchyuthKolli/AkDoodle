import React from "react";
import { User2 } from "lucide-react";

export const TableDiagram = ({ players, activeUserId, currentUserId }) => {
  const normId = (v) => String(v == null ? "" : v);

  // Position players around the table perimeter in a circular pattern
  const getSeatPosition = (seat, totalSeats) => {
    // Calculate angle for circular positioning
    const angleStep = 360 / totalSeats;
    const angle = angleStep * (seat - 1) - 90; // Start from top (12 o'clock)

    // Convert polar to cartesian coordinates
    // More seats => keep avatars closer to edge to protect center play piles.
    const radius = totalSeats >= 6 ? 47 : totalSeats >= 4 ? 46 : 45; // % from center
    const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
    const y = 50 + radius * Math.sin((angle * Math.PI) / 180);

    return { x, y, angle };
  };

  const sortedPlayers = [...(players || [])].sort((a, b) => (a?.seat || 0) - (b?.seat || 0));
  const meIdx = sortedPlayers.findIndex((p) => normId(p?.user_id) === normId(currentUserId));
  const displayPlayers =
    meIdx >= 0 ? [...sortedPlayers.slice(meIdx + 1), ...sortedPlayers.slice(0, meIdx + 1)] : sortedPlayers;

  const totalSeats = displayPlayers.length || 0;
  const compactSeats = totalSeats >= 4;

  return (
    <div className="relative w-full h-full">
      {/* Player positions around the table */}
      {displayPlayers.map((player, idx) => {
        // Use contiguous visual position index so gaps in seat numbers (after kick/drop) do not overlap avatars.
        const { x, y } = getSeatPosition(idx + 1, totalSeats || 1);
        const isActive = normId(player.user_id) === normId(activeUserId);
        const isCurrent = normId(player.user_id) === normId(currentUserId);

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
              flex flex-col items-center ${compactSeats ? "gap-1 p-2" : "gap-2 p-3"} max-md:p-1.5 rounded-xl transition-all backdrop-blur-sm
              ${isActive
                ? "bg-amber-500/40 border-3 border-amber-400 ring-4 ring-amber-400/50 shadow-xl shadow-amber-400/50"
                : "bg-green-900/60 border-2 border-green-700/80"
              }
              ${isCurrent
                ? "shadow-lg shadow-green-400/50"
                : ""
              }
            `}>
              <div className={`
                ${compactSeats ? "w-11 h-11" : "w-14 h-14"} max-md:w-9 max-md:h-9 rounded-full flex items-center justify-center border-2 overflow-hidden
                ${isActive
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
                <div className={`${compactSeats ? "text-xs" : "text-sm"} max-md:text-[10px] font-bold text-white truncate max-w-[80px] max-md:max-w-[56px] drop-shadow`}>
                  {isCurrent ? "You" : player.display_name?.slice(0, 10) || `Player ${player.seat}`}
                </div>
                <div className={`${compactSeats ? "text-[10px]" : "text-xs"} max-md:text-[9px] text-green-200 font-medium`}>Seat {player.seat}</div>
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
