import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Eye, Check, X } from "lucide-react";
import { toast } from "sonner";
import { socket } from "@/socket";   // ✅ IMPORTANT

export default function SpectateControls({
  tableId,
  currentUserId,
  isEliminated,
  spectateRequests,
  isHost,
  players
}) {
  const [requesting, setRequesting] = useState(false);
  const [granting, setGranting] = useState(null);

  /* ---------------------------------------
     Request Spectate (Eliminated Player)
  ----------------------------------------*/
  const handleRequestSpectate = () => {
    setRequesting(true);

    socket.emit(
      "request_spectate",
      { table_id: tableId },
      (res) => {
        setRequesting(false);

        if (!res || !res.ok) {
          toast.error("Failed to request spectate");
          return;
        }

        toast.success("Spectate request sent to host");
      }
    );
  };

  /* ---------------------------------------
     Host: Grant / Deny
  ----------------------------------------*/
  const handleGrantSpectate = (userId, granted) => {
    setGranting(userId);

    socket.emit(
      "grant_spectate",
      { table_id: tableId, user_id: userId, granted },
      (res) => {
        setGranting(null);

        if (!res || !res.ok) {
          toast.error("Failed to process response");
          return;
        }

        toast.success(granted ? "Spectate granted" : "Spectate denied");
      }
    );
  };

  const getUserName = (userId) =>
    players?.find((pl) => pl.user_id === userId)?.display_name ||
    userId.slice(0, 8);

  return (
    <div className="space-y-4">

      {/* Eliminated -> Request Button */}
      {isEliminated && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">You've been eliminated</h3>
          </div>

          <p className="text-sm text-slate-300 mb-3">
            Request permission from host to spectate the game.
          </p>

          <Button
            onClick={handleRequestSpectate}
            disabled={requesting}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Eye className="w-4 h-4 mr-2" />
            {requesting ? "Requesting..." : "Request to Spectate"}
          </Button>
        </div>
      )}

      {/* Host — Spectate Requests */}
      {isHost && spectateRequests?.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">

          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-white">Spectate Requests</h3>

            <span className="ml-auto bg-amber-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {spectateRequests.length}
            </span>
          </div>

          <div className="space-y-2">
            {spectateRequests.map((uid) => (
              <div
                key={uid}
                className="flex items-center justify-between bg-slate-700/50 rounded p-3"
              >
                <span className="text-white font-medium">
                  {getUserName(uid)}
                </span>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={granting === uid}
                    onClick={() => handleGrantSpectate(uid, true)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" />
                  </Button>

                  <Button
                    size="sm"
                    disabled={granting === uid}
                    variant="destructive"
                    onClick={() => handleGrantSpectate(uid, false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
