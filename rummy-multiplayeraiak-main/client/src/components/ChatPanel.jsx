import React, { useState, useEffect, useRef } from "react";
import { useTableSocket } from "../../apiclient/socket";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { MessageCircle, Send, X } from "lucide-react";

/**
 * ChatPanel (Realtime Socket Version)
 *
 * props:
 *  - tableId
 *  - userId
 *  - isOpen
 *  - onToggle()
 */
export default function ChatPanel({ tableId, userId, isOpen, onToggle }) {
  const socket = useTableSocket();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef(null);

  /* ----------------------------------------------------
     SOCKET LISTENERS (real-time)
  ---------------------------------------------------- */
  useEffect(() => {
    if (!socket) return;

    // Join table chat room
    socket.emit("chat.joinTable", { tableId, userId });

    // Receive old & live messages
    socket.on("chat.messages", (payload) => {
      if (payload?.messages) {
        setMessages(payload.messages);
      }
    });

    socket.on("chat.newMessage", (msg) => {
      setMessages((old) => [...old, msg]);
    });

    return () => {
      socket.off("chat.messages");
      socket.off("chat.newMessage");
      socket.emit("chat.leaveTable", { tableId, userId });
    };
  }, [socket, tableId, userId]);

  /* ----------------------------------------------------
     Auto scroll to bottom on new message
  ---------------------------------------------------- */
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  /* ----------------------------------------------------
     Send Message
  ---------------------------------------------------- */
  const sendMessage = () => {
    if (!newMessage.trim()) return;
    if (!socket) return;

    setSending(true);

    socket.emit(
      "chat.send",
      {
        tableId,
        userId,
        message: newMessage.trim(),
      },
      () => {
        setSending(false);
        setNewMessage("");
      }
    );
  };

  const keyPressHandler = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ----------------------------------------------------
     UI RENDER
  ---------------------------------------------------- */
  return (
    <>
      {/* Floating Chat Toggle Button */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed right-4 bottom-4 bg-green-600 hover:bg-green-700 text-white p-4 rounded-full shadow-xl z-50"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat Sidebar */}
      {isOpen && (
        <div className="fixed right-0 top-0 h-full w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              Table Chat
            </h3>
            <Button variant="ghost" size="sm" onClick={onToggle}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4 text-white" ref={scrollRef}>
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg ${
                    msg.userId === userId
                      ? "bg-green-600/20 border border-green-600/40 ml-8"
                      : msg.isSystem
                      ? "bg-amber-600/20 border border-amber-500/40 text-center"
                      : "bg-slate-800 border border-slate-700 mr-8"
                  }`}
                >
                  {/* username */}
                  {!msg.isSystem && (
                    <div className="text-xs text-slate-400 mb-1">
                      {msg.userId === userId ? "You" : msg.username || "Player"}
                      {msg.private && (
                        <span className="ml-2 text-amber-400">(Private)</span>
                      )}
                    </div>
                  )}

                  {/* message */}
                  <div
                    className={`text-sm ${
                      msg.isSystem
                        ? "text-amber-300 font-semibold"
                        : "text-white"
                    }`}
                  >
                    {msg.message}
                  </div>

                  {/* timestamp */}
                  <div className="text-xs text-slate-600 mt-1">
                    {msg.time
                      ? new Date(msg.time).toLocaleTimeString()
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input Box */}
          <div className="p-4 border-t border-slate-700 bg-slate-800">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={keyPressHandler}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 bg-slate-900 border border-slate-700 text-white"
              />

              <Button
                onClick={sendMessage}
                disabled={sending || !newMessage.trim()}
                className="bg-green-600 hover:bg-green-700"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
