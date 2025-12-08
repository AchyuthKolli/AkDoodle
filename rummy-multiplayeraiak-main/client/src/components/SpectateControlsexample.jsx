import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Check, X } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "app";

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
     Request to Spectate (Eliminated Player)
  -----------------------------------------*/
  const handleRequestSpectate = async () => {
    setRequesting(true);
    try {
      await apiClient.request_spectate({ table_id: tableId });
      toast.success("Spectate request sent to host");
    } catch (error) {
      toast.error("Failed to request spectate access");
    } finally {
      setRequesting(false);
    }
  };

  /* ---------------------------------------
     Host: Grant or Deny Spectate Request
  -----------------------------------------*/
  const handleGrantSpectate = async (userId, granted) => {
    setGranting(userId);
    try {
      await apiClient.grant_spectate({
        table_id: tableId,
        user_id: userId,
        granted
      });
      toast.success(granted ? "Spectate access granted" : "Spectate access denied");
    } catch (error) {
      toast.error("Failed to process spectate request");
    } finally {
      setGranting(null);
    }
  };

  const getUserName = (userId) => {
    const p = players?.find((pl) => pl.user_id === userId);
    return p?.display_name || userId.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------
        Eliminated player → Request panel
      -------------------------------*/}
      {isEliminated && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">You've been eliminated</h3>
          </div>

          <p className="text-sm text-slate-300 mb-3">
            Request permission from the host to spectate the remaining players.
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

      {/* ------------------------------
         Host: Pending Spectate Requests
      -------------------------------*/}
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
                    onClick={() => handleGrantSpectate(uid, true)}
                    disabled={granting === uid}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" />
                  </Button>

                  <Button
                    onClick={() => handleGrantSpectate(uid, false)}
                    disabled={granting === uid}
                    size="sm"
                    variant="destructive"
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
