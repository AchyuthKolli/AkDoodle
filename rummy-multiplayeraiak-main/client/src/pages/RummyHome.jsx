import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

// UI Components (your Vite-correct imports)
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

// Icons
import {
  Sparkles,
  Eye,
  EyeOff,
  LogIn,
  User2,
  LogOut,
} from "lucide-react";

// Notifications
import { toast } from "sonner";

// API Client (your folder moved to src/apiclient)
import apiclient from "../apiclient";

// Auth (Google)
import { useAuth } from "../auth/AuthContext";
// import stackClientApp removed 



// ----------------------------------------------------
// Game Variants
// ----------------------------------------------------
const gameVariants = [
  {
    id: "no_wildcard",
    title: "No Wild Card",
    description: "Pure classic rummy with printed jokers only",
    features: [
      "No wild joker cards",
      "Only printed jokers",
      "Simpler strategy",
      "Perfect for beginners",
    ],
    icon: <EyeOff className="w-12 h-12" />,
    color: "from-blue-500 to-cyan-500",
  },
  {
    id: "open_wildcard",
    title: "Open Wild Card",
    description: "Traditional rummy with wild card revealed at start",
    features: [
      "Wild card shown immediately",
      "Traditional gameplay",
      "Strategic substitutions",
      "Classic experience",
    ],
    icon: <Eye className="w-12 h-12" />,
    color: "from-green-500 to-emerald-500",
  },
  {
    id: "close_wildcard",
    title: "Close Wild Card",
    description: "Advanced variant - wild card reveals after first sequence",
    features: [
      "Hidden wild card initially",
      "Reveals after pure sequence",
      "Advanced strategy",
      "Maximum challenge",
    ],
    icon: <Sparkles className="w-12 h-12" />,
    color: "from-purple-500 to-pink-500",
  },
];


// ----------------------------------------------------
// Home Component
// ----------------------------------------------------
export default function Home() {
  const navigate = useNavigate();
  const { user, login, logout } = useAuth();


  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joining, setJoining] = useState(false);

  // -----------------------------
  // Navigation (Variant Select)
  // -----------------------------
  const handleSelectVariant = (variantId) => {
    navigate(`/CreateTable?variant=${variantId}`);
  };

  // -----------------------------
  // Join Room Handler
  // -----------------------------
  const handleJoinRoom = async () => {
    if (!user) {
      toast.error("Please sign in to join a room");
      return;
    }

    if (!playerName.trim() || roomCode.trim().length !== 6) {
      toast.error("Enter your name and a valid 6-letter code");
      return;
    }

    setJoining(true);

    try {
      const body = { code: roomCode.trim().toUpperCase() };
      const res = await apiclient.join_table_by_code(body);

      if (!res.ok) {
        const err = await res.json().catch(() => ({
          detail: "Unknown error",
        }));
        toast.error(`Join failed: ${err.detail || "Error"}`);
        setJoining(false);
        return;
      }

      const data = res.data;

      toast.success(`Joined table! Seat ${data.seat}`);
      navigate(`/Table?tableId=${data.table_id}`);
    } catch (e) {
      console.error("Join error:", e);
      const msg = e.response?.data?.error || e.response?.data?.detail || e.message || "Failed to join room";
      toast.error(`Join failed: ${msg}`);
    } finally {
      setJoining(false);
    }
  };

  // -----------------------------
  // Auth Actions
  // -----------------------------
  const handleSignIn = () => {
    login(); // Triggers Google Popup
  };

  const handleSignOut = async () => {
    logout();
    toast.success("Signed out successfully");
  };

  // ----------------------------------------------------
  // Render UI
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">

      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">

            {/* Title / Logo Area */}
            <div className="flex items-center gap-3">
              {/* Optional: Add Logo IMG here if available */}
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Rummy Room</h1>
                <p className="text-slate-400 text-sm">Multiplayer Card Game</p>
              </div>
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-4 bg-slate-800/50 p-1.5 pr-4 rounded-full border border-slate-700">
                  <div
                    className="w-9 h-9 rounded-full border border-green-500 overflow-hidden cursor-pointer"
                    onClick={() => navigate("/profile")}
                  >
                    <img
                      src={user.profilePictureUrl || user.picture || user.photoUrl}
                      className="w-full h-full object-cover"
                      alt="profile"
                    />
                  </div>

                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white leading-none">
                      {user.displayName?.split(" ")[0] || "Player"}
                    </span>
                    <span className="text-[10px] text-green-400 font-mono">ONLINE</span>
                  </div>

                  <div className="h-4 w-px bg-slate-700 mx-1"></div>

                  <button
                    onClick={handleSignOut}
                    className="text-slate-400 hover:text-white transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {/* Sign Up / Sign In buttons usually do the same with Google Auth */}
                  <Button
                    onClick={handleSignIn}
                    className="bg-transparent hover:bg-slate-800 text-white border border-slate-600 font-semibold px-4 py-2"
                  >
                    Sign In
                  </Button>
                  <Button
                    onClick={handleSignIn}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold px-5 py-2 shadow-lg shadow-blue-900/20"
                  >
                    Sign Up
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Game Cards */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {gameVariants.map((variant) => (
            <Card
              key={variant.id}
              className="group relative overflow-hidden bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all duration-300 hover:scale-105 cursor-pointer"
              onClick={() => handleSelectVariant(variant.id)}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${variant.color} opacity-10 group-hover:opacity-20`} />

              <div className="relative p-8">

                {/* Icon */}
                <div
                  className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${variant.color} flex items-center justify-center text-white mb-6`}
                >
                  {variant.icon}
                </div>

                <h2 className="text-2xl font-bold text-white mb-3">{variant.title}</h2>

                <p className="text-slate-400 mb-6">{variant.description}</p>

                {/* Features */}
                <ul className="space-y-2 mb-8">
                  {variant.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center text-sm text-slate-300">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${variant.color} mr-3`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full bg-gradient-to-r ${variant.color} hover:opacity-90 text-white font-semibold`}
                >
                  Play {variant.title}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Join Table */}
        <div className="mt-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Join a Friend's Game</h2>
            <p className="text-slate-400">Enter the 6-letter room code shared by your friend</p>
          </div>

          <Card className="max-w-2xl mx-auto bg-slate-800/50 border border-slate-700 p-8">

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <LogIn className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Join Room</h3>
                <p className="text-sm text-slate-400">Enter details to join the table</p>
              </div>
            </div>

            <div className="space-y-4">

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Your Name
                </label>
                <Input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Room Code
                </label>
                <Input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-letter code"
                  maxLength={6}
                  className="uppercase tracking-wider text-lg font-mono text-center text-white"
                />
              </div>

              <Button
                onClick={handleJoinRoom}
                disabled={!user || joining || !playerName.trim() || roomCode.length !== 6}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 text-white font-semibold py-6 text-lg"
              >
                {joining ? "Joining..." : "Join Game"}
              </Button>

              {!user && (
                <p className="text-sm text-amber-400 text-center">
                  Please sign in to join a room
                </p>
              )}
            </div>

          </Card>
        </div>

      </div>
    </div >
  );
}
