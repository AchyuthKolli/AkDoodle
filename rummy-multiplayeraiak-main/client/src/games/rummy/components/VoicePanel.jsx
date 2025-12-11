import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { socket } from "../../../socket";

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
 * - players
 */
export default function VoicePanel({
  tableId,
  currentUserId,
  isHost,
  players,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [myMuted, setMyMuted] = useState(false);

  /* ---------------------------
     SOCKET LISTENERS
  ----------------------------*/
  useEffect(() => {
    if (!tableId) return;

    // someone joined voice
    socket.on("voice.joined", ({ user_id }) => {
      setParticipants((prev) => {
        if (!prev.find((p) => p.user_id === user_id)) {
          return [...prev, { user_id, is_muted: false, is_speaking: false }];
        }
        return prev;
      });
    });

    // someone left
    socket.on("voice.left", ({ user_id }) => {
      setParticipants((prev) => prev.filter((p) => p.user_id !== user_id));
    });

    // someone got muted
    socket.on("voice.muted", ({ user_id }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.user_id === user_id ? { ...p, is_muted: true } : p
        )
      );
    });

    // someone got unmuted
    socket.on("voice.unmuted", ({ user_id }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.user_id === user_id ? { ...p, is_muted: false } : p
        )
      );
    });

    return () => {
      socket.off("voice.joined");
      socket.off("voice.left");
      socket.off("voice.muted");
      socket.off("voice.unmuted");
    };
  }, [tableId]);

  /* ---------------------------
     JOIN / LEAVE CALL
  ----------------------------*/
  const toggleCall = () => {
    if (!inCall) {
      socket.emit("voice.join", { table_id: tableId, user_id: currentUserId });
      setInCall(true);
      setIsOpen(true);
      toast.success("Joined voice call");
    } else {
      socket.emit("voice.leave", { table_id: tableId, user_id: currentUserId });
      setInCall(false);
      toast.success("Left voice call");
    }
  };

  /* ---------------------------
     MUTE / UNMUTE yourself
  ----------------------------*/
  const toggleMyMute = () => {
    if (!inCall) return;

    if (!myMuted) {
      socket.emit("voice.mute", { table_id: tableId, user_id: currentUserId });
      setMyMuted(true);
    } else {
      socket.emit("voice.unmute", { table_id: tableId, user_id: currentUserId });
      setMyMuted(false);
    }
  };

  /* ---------------------------
     HOST — MUTE ANY PLAYER
  ----------------------------*/
  const mutePlayer = (id, muted) => {
    if (!isHost) return;

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
      socket.emit("voice.mute", { table_id: tableId, user_id: p.user_id });
    });

    toast.success("Muted all");
  };

  /* ---------------------------
     Minimized floating button
  ----------------------------*/
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed top-8 right-4 z-40 px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm transition-all ${inCall
          ? "bg-green-700 hover:bg-green-600 text-green-100 animate-pulse"
          : "bg-green-800 hover:bg-green-700 text-green-100"
          }`}
      >
        <ChevronRight className="w-4 h-4" />
        Call
      </button>
    );
  }

  /* ---------------------------
     FULL Voice Panel UI
  ----------------------------*/
  return (
    <div className="fixed bottom-4 right-4 z-30 w-80 bg-slate-900 border-2 border-slate-700 rounded-lg shadow-2xl">
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-white">Voice Call</h3>
          {inCall && (
            <span className="px-2 py-0.5 text-xs bg-green-600 text-white rounded-full">
              Live
            </span>
          )}
        </div>

        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <ScrollArea className="h-64 p-3">
        {!inCall ? (
          <div className="text-center py-8 text-slate-400">
            <Phone className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Join the voice call to see participants</p>
          </div>
        ) : participants.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Waiting for others…</div>
        ) : (
          <div className="space-y-2">
            {participants.map((p) => {
              const isMe = p.user_id === currentUserId;

              return (
                <div
                  key={p.user_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border ${p.is_speaking ? "border-green-500 ring-2 ring-green-500/50" : "border-slate-500"} bg-slate-700`}>
                        {(() => {
                          const playerInfo = players?.find(x => x.user_id === p.user_id);
                          if (playerInfo?.profile_image_url) {
                            return <img src={playerInfo.profile_image_url} alt={playerInfo.display_name} className="w-full h-full object-cover" />;
                          }
                          return (
                            <span className="text-white font-semibold text-sm">
                              {(playerInfo?.display_name || p.display_name || p.user_id).slice(0, 2).toUpperCase()}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div>
                      <p className={isMe ? "text-green-400 font-medium" : "text-white font-medium"}>
                        {(() => {
                          const playerInfo = players?.find(x => x.user_id === p.user_id);
                          return playerInfo?.display_name || p.display_name || p.user_id.slice(0, 8);
                        })()}
                        {isMe && " (You)"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {p.is_muted ? (
                      <MicOff className="w-4 h-4 text-red-400" />
                    ) : (
                      <Mic className="w-4 h-4 text-green-400" />
                    )}

                    {isHost && !isMe && (
                      <Button
                        onClick={() => mutePlayer(p.user_id, p.is_muted)}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                      >
                        {p.is_muted ? "Unmute" : "Mute"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t border-slate-700 bg-slate-800 space-y-2">
        {isHost && inCall && (
          <Button
            onClick={muteAll}
            variant="outline"
            size="sm"
            className="w-full bg-slate-700 hover:bg-slate-600"
          >
            <MicOff className="w-4 h-4 mr-2" />
            Mute All
          </Button>
        )}

        <div className="flex gap-2">
          {inCall && (
            <Button
              onClick={toggleMyMute}
              className={`flex-1 ${myMuted ? "bg-red-600" : "bg-green-600"
                } text-white`}
            >
              {myMuted ? (
                <MicOff className="w-4 h-4 mr-2" />
              ) : (
                <Mic className="w-4 h-4 mr-2" />
              )}
              {myMuted ? "Unmute" : "Mute"}
            </Button>
          )}

          <Button
            onClick={toggleCall}
            className={`flex-1 ${inCall ? "bg-red-600" : "bg-green-600"
              } text-white`}
          >
            {inCall ? (
              <>
                <PhoneOff className="w-4 h-4 mr-2" /> Leave
              </>
            ) : (
              <>
                <Phone className="w-4 h-4 mr-2" /> Join
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
