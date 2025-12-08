import React, { useEffect, useState } from "react";
import apiclient from "../apiclient";
import { useUser } from "@stackframe/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ProfileCard() {
  const user = useUser();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  /* ---------------------------------------------
      Load Profile on Login
  --------------------------------------------- */
  useEffect(() => {
    const load = async () => {
      if (!user) return; // user not logged in yet

      setLoading(true);
      setError(null);

      try {
        const res = await apiclient.get_my_profile();
        const data = await res.json();
        setProfile(data);
      } catch (err) {
        console.error("profile error:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  /* ---------------------------------------------
      Not Logged In View
  --------------------------------------------- */
  if (!user) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            Sign in to manage your profile.
          </p>

          <button
            onClick={() => navigate("/auth/sign-in")}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------
      Logged In View
  --------------------------------------------- */
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium text-white">Your Profile</h3>
        {loading && (
          <span className="text-xs text-slate-400">Loading…</span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400 mb-2">{error}</p>
      )}

      <div className="space-y-3">
        {/* Display Name */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Display Name
          </label>

          <input
            value={profile?.display_name || user?.displayName || "Anonymous"}
            readOnly
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white cursor-not-allowed"
          />
        </div>

        {/* User ID */}
        {profile && (
          <p className="text-xs text-slate-400">
            User ID:{" "}
            <span className="text-slate-100">{profile.user_id}</span>
          </p>
        )}
      </div>
    </div>
  );
}
