import React from 'react';
import { User } from 'lucide-react';

interface Props {
  userId?: string;
  position: string;
  name: string;
  profilePic?: string | null;
  isActive?: boolean;
  isCurrentUser?: boolean;
  expanded?: boolean; // optional - used by scoreboard/expand toggles
  isDisqualified?: boolean; // optional visual flag
  onToggleExpand?: (userId?: string) => void;
  onSpectate?: (userId?: string) => void;
}

export const PlayerProfile: React.FC<Props> = ({
  userId,
  position,
  name,
  profilePic,
  isActive = false,
  isCurrentUser = false,
  expanded = false,
  isDisqualified = false,
  onToggleExpand,
  onSpectate
}) => {
  return (
    <div
      className={`relative pointer-events-auto flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
        isActive
          ? 'bg-amber-500/90 border-2 border-amber-300 shadow-lg shadow-amber-500/50 scale-110'
          : isCurrentUser
          ? 'bg-blue-900/80 border-2 border-blue-500/50'
          : 'bg-slate-800/80 border-2 border-slate-600/50'
      } ${isDisqualified ? 'opacity-60 grayscale' : ''}`}
      title={name}
      aria-label={`${name} — ${position}`}
    >
      {/* Avatar with Profile Picture */}
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center overflow-hidden ${
          isActive
            ? 'bg-amber-400 border-2 border-white'
            : isCurrentUser
            ? 'bg-blue-600 border-2 border-blue-400'
            : 'bg-slate-700 border-2 border-slate-500'
        }`}
      >
        {profilePic ? (
          <img
            src={profilePic}
            alt={`${name} avatar`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <User
            className={`w-6 h-6 ${
              isActive ? 'text-white' : isCurrentUser ? 'text-blue-200' : 'text-slate-300'
            }`}
          />
        )}
      </div>

      {/* Name */}
      <div className="text-center">
        <p
          className={`text-xs font-bold ${
            isActive ? 'text-amber-100' : isCurrentUser ? 'text-blue-100' : 'text-slate-200'
          } truncate`}
          style={{ maxWidth: 100 }}
        >
          {name}
        </p>
        <p
          className={`text-[10px] ${
            isActive ? 'text-amber-200' : isCurrentUser ? 'text-blue-300' : 'text-slate-400'
          }`}
        >
          {position}
        </p>
      </div>

      {/* Active Turn Indicator */}
      {isActive && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 border-2 border-white rounded-full animate-pulse" />
      )}

      {/* Small controls for future use (collapsed by default) */}
      {(onToggleExpand || onSpectate) && (
        <div className="absolute bottom-1 right-1 flex gap-1">
          {onToggleExpand && (
            <button
              onClick={() => onToggleExpand && onToggleExpand(userId)}
              title={expanded ? 'Collapse' : 'Expand'}
              className="p-0.5 rounded bg-black/20 hover:bg-black/30"
              aria-pressed={expanded}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                {expanded ? (
                  <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
                ) : (
                  <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                )}
              </svg>
            </button>
          )}
          {onSpectate && (
            <button
              onClick={() => onSpectate && onSpectate(userId)}
              title="Request spectate / spectate"
              className="p-0.5 rounded bg-black/20 hover:bg-black/30"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
