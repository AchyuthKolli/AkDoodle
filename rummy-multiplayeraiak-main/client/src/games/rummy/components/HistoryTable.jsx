import { useState, useEffect } from "react";
import { apiClient } from "../../apiclient"; // adjust if needed
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, Crown, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function HistoryTable({ tableId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get_round_history({ table_id: tableId });
        const data = await res.json();

        setHistory(data.rounds || []);
      } catch (err) {
        console.error("Failed to fetch round history:", err);
        toast.error("Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [tableId]);

  const formatTimestamp = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  if (!history.length) {
    return (
      <div className="text-center p-8 text-slate-400">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No rounds completed yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] p-2">
      <div className="space-y-3">
        {history.map((round) => (
          <div
            key={round.round_number}
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800/80 transition-colors"
          >
            {/* Header Row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="bg-green-900/30 rounded-full p-2">
                  <Trophy className="w-4 h-4 text-green-400" />
                </div>
                <span className="font-semibold text-white">
                  Round {round.round_number}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {formatTimestamp(round.completed_at)}
              </span>
            </div>

            {/* Winner */}
            {round.winner_user_id ? (
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-amber-400 font-medium">
                  Winner:{" "}
                  {round.winner_name ||
                    round.winner_user_id?.slice(0, 8) ||
                    "Unknown"}
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mb-2">
                No winner recorded
              </p>
            )}

            {/* Disqualified Players */}
            {!!round.disqualified_users?.length && (
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-red-400 font-medium mb-1">
                    Disqualified:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {round.disqualified_users.map((uid) => (
                      <span
                        key={uid}
                        className="text-xs bg-red-900/30 text-red-300 px-2 py-0.5 rounded"
                      >
                        {uid.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
