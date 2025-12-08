import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@stackframe/react";
import { LogOut, ArrowLeft, UserPlus, Trash2 } from "lucide-react";

export default function Profile() {
  const navigate = useNavigate();
  const user = useUser();

  // Static Friend List
  const staticFriends = [
    { id: "101", name: "Kiran" },
    { id: "102", name: "Mahesh" },
    { id: "103", name: "Rohit" }
  ];

  // LocalStorage Friends
  const [friends, setFriends] = useState([]);
  const [newFriend, setNewFriend] = useState("");

  // Load localStorage friends
  useEffect(() => {
    const saved = localStorage.getItem("rummy_friends");
    if (saved) {
      setFriends(JSON.parse(saved));
    }
  }, []);

  // Save localStorage friends
  useEffect(() => {
    localStorage.setItem("rummy_friends", JSON.stringify(friends));
  }, [friends]);

  const addFriend = () => {
    if (!newFriend.trim()) return;
    setFriends([...friends, { id: Date.now(), name: newFriend }]);
    setNewFriend("");
  };

  const removeFriend = (id) => {
    setFriends(friends.filter((f) => f.id !== id));
  };

  const logout = async () => {
    try {
      await window.stackClientApp.signOut();
      navigate("/");
    } catch (e) {
      console.error(e);
    }
  };

  if (!user) {
    return (
      <div className="text-center text-white p-10">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-5 text-white">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800/70 rounded-lg hover:bg-slate-700 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>

        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 bg-red-700 hover:bg-red-600 rounded-lg transition"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 shadow-xl max-w-xl mx-auto">
        
        <div className="flex flex-col items-center">
          {/* Profile Pic */}
          <img
            src={user.profileImageUrl || user.picture || user.photoURL}
            alt="profile"
            className="w-28 h-28 rounded-full border-4 border-amber-400 shadow-lg"
          />

          <h2 className="mt-4 text-2xl font-bold">{user.displayName}</h2>
          <p className="text-amber-300">{user.email}</p>
        </div>

        {/* Friends Section */}
        <div className="mt-8">
          <h3 className="text-xl font-bold mb-4">Friends</h3>

          {/* Static Friends */}
          <div className="mb-5">
            <p className="text-sm text-slate-400 mb-2">Suggested Friends:</p>
            <ul className="bg-slate-900/40 p-3 rounded-lg border border-slate-700 space-y-2">
              {staticFriends.map((f) => (
                <li key={f.id} className="text-slate-300">{f.name}</li>
              ))}
            </ul>
          </div>

          {/* Your Friends */}
          <div className="mb-5">
            <p className="text-sm text-slate-400 mb-2">Your Friends:</p>
            <ul className="bg-slate-900/40 p-3 rounded-lg border border-slate-700 space-y-2">
              {friends.length === 0 && (
                <p className="text-slate-500 text-sm">No friends added yet.</p>
              )}
              {friends.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between text-slate-300"
                >
                  {f.name}
                  <button
                    onClick={() => removeFriend(f.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Add New Friend */}
          <div className="flex gap-2">
            <input
              value={newFriend}
              onChange={(e) => setNewFriend(e.target.value)}
              placeholder="Friend name"
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
            />
            <button
              onClick={addFriend}
              className="flex items-center gap-1 px-3 py-2 bg-green-700 hover:bg-green-600 rounded-lg"
            >
              <UserPlus className="w-5 h-5" />
              Add
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
