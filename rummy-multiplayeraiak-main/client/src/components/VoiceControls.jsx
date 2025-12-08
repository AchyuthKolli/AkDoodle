import React, { useState } from "react";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "./ui/button";

/**
 * Props:
 * - tableId
 * - onToggleAudio(enabled)
 * - onToggleVideo(enabled)
 */
export default function VoiceControls({ tableId, onToggleAudio, onToggleVideo }) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);

  const toggleAudio = () => {
    const flag = !audioEnabled;
    setAudioEnabled(flag);
    onToggleAudio(flag);
  };

  const toggleVideo = () => {
    const flag = !videoEnabled;
    setVideoEnabled(flag);
    onToggleVideo(flag);
  };

  return (
    <div className="fixed bottom-4 left-4 flex gap-2 z-40">

      {/* AUDIO BUTTON */}
      <Button
        onClick={toggleAudio}
        className={`rounded-full p-3 ${
          audioEnabled
            ? "bg-green-600 hover:bg-green-700"
            : "bg-red-600 hover:bg-red-700"
        }`}
        title={audioEnabled ? "Mute Microphone" : "Unmute Microphone"}
      >
        {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </Button>

      {/* VIDEO BUTTON */}
      <Button
        onClick={toggleVideo}
        className={`rounded-full p-3 ${
          videoEnabled
            ? "bg-green-600 hover:bg-green-700"
            : "bg-slate-600 hover:bg-slate-700"
        }`}
        title={videoEnabled ? "Disable Camera" : "Enable Camera"}
      >
        {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </Button>
    </div>
  );
}
