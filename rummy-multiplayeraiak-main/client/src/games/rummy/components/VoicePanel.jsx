import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { socket } from "../../../socket";
import { useVoice } from "../hooks/useVoice";
import { useRummy } from "../RummyContext";

import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  X,
  Users,
  ChevronRight,
} from "lucide-react";

import { toast } from "sonner";

/**
 * Props:
 * - tableId
 * - currentUserId
 * - isHost
 * - players (fallback)
 */
export default function VoicePanel({
  tableId,
  currentUserId,
  isHost,
  players: initialPlayers,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { joinCall, leaveCall, toggleMute, isMuted, inCall, participants } = useVoice(tableId, currentUserId);

  // Use context players if available (for avatars), else fallback
  const context = useRummy();
  // Safety check: if VoicePanel is ever used outside provider, context might be null
  const playersMap = context?.players || {};
  const playersList = Object.keys(playersMap).length > 0 ? Object.values(playersMap) : (initialPlayers || []);

  // Helper to get player details
  const getPlayer = (uid) => {
    // Try to find in context list first
    const p = playersList.find((p) => p.user_id === uid);
    return p;
  };
  // Render invisible audio elements for each remote participant
  const audioElements = participants.map((p) => (
    <audio
      key={p.userId}
      ref={(el) => {
        if (el && p.stream) el.srcObject = p.stream;
      }}
      autoPlay
      playsInline
    />
  ));

  /* ---------------------------
     HOST — MUTE ANY PLAYER
  ----------------------------*/
  const mutePlayer = (id, muted) => {
    if (!isHost) return;
    // Tell server to broadcast a mute command to that user
    // The server should emit "voice.muted" to everyone for UI updates, and "voice.force-mute" to the target?
    // For now, consistent with previous code:
    if (!muted) {
      socket.emit("voice.mute", { table_id: tableId, user_id: id });
    } else {
      socket.emit("voice.unmute", { table_id: tableId, user_id: id });
    }
  };

  /* ---------------------------
     HOST — MUTE ALL
  ----------------------------*/
  const muteAll = () => {
    if (!isHost) return;
    participants.forEach((p) => {
      // Ideally send one bulk command
      socket.emit("voice.mute", { table_id: tableId, user_id: p.userId });
    });
    // Fallback if participants list in useVoice doesn't include everyone in the room (it only includes connected peers)
    // The original code used socket list.
    // We can allow muting anyone in the 'players' list too.
    toast.success("Muting active participants...");
  };

  const handleToggleCall = () => {
    if (inCall) {
      leaveCall();
      toast.info("Left voice call");
    } else {
      joinCall();
      toast.success("Joined voice call");
      setIsOpen(true);
    }
  };



  /* ---------------------------
     Minimized floating button
  ----------------------------*/
  if (!isOpen) {
    return (
      <>
        {audioElements}
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed top-32 right-4 z-40 px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm transition-all ${inCall
            ? "bg-green-700 hover:bg-green-600 text-green-100 animate-pulse"
            : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
            }`}
        >
          {inCall ? <Mic className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          <span className="hidden md:inline">{inCall ? "In Call" : "Voice"}</span>
        </button>
      </>
    );
  }

  /* ---------------------------
     Expanded Panel
  ----------------------------*/
  return (
    <>
      {audioElements}
      <div className="fixed top-32 right-4 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-72 overflow-hidden flex flex-col transition-all animate-in fade-in slide-in-from-right-5">
        {/* Header */}
        <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${inCall ? "bg-green-500 animate-pulse" : "bg-slate-500"}`} />
            <h3 className="font-semibold text-white text-sm">Voice Call</h3>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Participants List */}
        <ScrollArea className="flex-1 max-h-60 min-h-[150px] p-2 bg-slate-900/50">
          {!inCall ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                <Phone className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-400">Join the voice chat to talk with other players!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* ME */}
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/80 border border-indigo-500/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-lg">
                    ME
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">You</p>
                    <p className="text-[10px] text-indigo-300">{isMuted ? "Muted" : "Speaking"}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 rounded-full ${isMuted ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              </div>

              {/* OTHERS */}
              {playersList.map((player) => {
                if (player.user_id === currentUserId) return null; // Skip self (already shown above)

                const participant = participants.find(p => p.userId === player.user_id);
                const isConnected = !!participant;

                return (
                  <div key={player.user_id} className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <img
                        src={player.profile_image_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.user_id}`}
                        className={`w-8 h-8 rounded-full ${isConnected ? "bg-slate-700" : "bg-slate-800 opacity-50"}`}
                        alt="av"
                      />
                      <div>
                        <p className={`text-sm font-medium ${isConnected ? "text-slate-200" : "text-slate-500"}`}>
                          {player.display_name || "User"}
                        </p>
                        <p className={`text-[10px] ${isConnected ? "text-green-400" : "text-slate-600"}`}>
                          {isConnected ? "Connected" : "Not in call"}
                        </p>
                      </div>
                    </div>
                    {isHost && isConnected && (
                      <button onClick={() => mutePlayer(player.user_id, false)} className="text-xs text-slate-500 hover:text-red-400">
                        Mute
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions */}
        <div className="p-3 bg-slate-800 border-t border-slate-700 flex flex-col gap-2">
          {inCall ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full bg-red-600 hover:bg-red-700 shadow-lg"
              onClick={handleToggleCall}
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              Leave Audio
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg"
              onClick={handleToggleCall}
            >
              <Phone className="w-4 h-4 mr-2" />
              Join Audio
            </Button>
          )}

          {isHost && inCall && participants.length > 0 && (
            <button onClick={muteAll} className="text-[10px] text-slate-500 hover:text-slate-300 text-center w-full mt-1">
              Mute All Participants
            </button>
          )}
        </div>
      </div>
    </>
  );
}
