import { useState, useEffect, useRef } from "react";
import { socket, sendChatMsg } from "../../../socket";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, X, Send, Lock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function ChatSidebar({ tableId, currentUserId, players }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Auto scroll when messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Receive messages live via SOCKET
  useEffect(() => {
    const handleIncoming = (msg) => {
      console.log("💬 Incoming socket msg:", msg);

      // Server sends keys as snake_case (user_id, sender_name, created_at, etc.)
      // Map them to camelCase or use as is if logic supports it.
      // ChatSidebar expects: msg.message, msg.senderName (or msg.userId), msg.timestamp

      const normalizedMsg = {
        ...msg,
        senderName: msg.sender_name || msg.senderName, // handle both
        timestamp: msg.created_at || msg.timestamp,
        userId: msg.user_id || msg.userId,
        isPrivate: msg.is_private || msg.isPrivate,
        recipientId: msg.recipient_id || msg.recipientId
      };

      // PRIVATE message filtering
      const isPrivate =
        normalizedMsg.isPrivate &&
        normalizedMsg.recipientId &&
        (normalizedMsg.recipientId === currentUserId ||
          normalizedMsg.userId === currentUserId);

      if (normalizedMsg.isPrivate && !isPrivate) return;

      setMessages((prev) => [...prev, normalizedMsg]);

      if (!isOpen) {
        setUnreadCount((u) => u + 1);
      }
    };

    socket.on("chat.message", handleIncoming); // Fixed event name

    return () => {
      socket.off("chat.message", handleIncoming);
    };
  }, [isOpen, currentUserId]);

  const sendMessage = () => {
    if (!messageText.trim()) return;

    const payload = {
      tableId,
      userId: currentUserId,
      message: messageText,
      isPrivate: !!recipient,
      recipientId: recipient || null,
    };

    // Updated signature: sendChatMsg(tableId, userId, text, isPrivate, recipientId)
    sendChatMsg(tableId, currentUserId, messageText, !!recipient, recipient || null);

    // Push to local UI (instant echo)
    setMessages((prev) => [
      ...prev,
      {
        ...payload,
        senderName:
          players.find((p) => p.userId === currentUserId)?.displayName ||
          "Me",
        timestamp: Date.now(),
      },
    ]);

    setMessageText("");
    setRecipient(null);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  // Detect @name for private chat
  const onInputChange = (value) => {
    setMessageText(value);

    const match = value.match(/^@(\w+)/);
    if (match) {
      const name = match[1].toLowerCase();
      const found = players.find((p) =>
        p.displayName.toLowerCase().startsWith(name)
      );
      if (found && found.userId !== currentUserId) {
        setRecipient(found.userId);
        return;
      }
    }

    setRecipient(null);
  };

  const getRecipientName = () => {
    return players.find((p) => p.userId === recipient)?.displayName;
  };

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setUnreadCount(0);
          }}
          className="fixed top-20 right-4 z-40 bg-blue-800 hover:bg-blue-700 text-blue-100 px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm transition-all"
        >
          <ChevronRight className="w-4 h-4" />
          Chat
          {unreadCount > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* SIDE BAR */}
      {isOpen && (
        <div className="fixed right-0 top-0 h-full w-80 bg-background border-l border-border shadow-lg z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Chat
            </h2>
            <Button onClick={() => setIsOpen(false)} variant="ghost" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Profile Button */}
          <div className="p-4 border-b border-border">
            <Button
              onClick={() => window.open("/profile", "_blank")}
              className="w-full bg-blue-900 hover:bg-blue-800 text-white"
            >
              My Profile (New Tab)
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-3">
              {messages.map((msg, i) => {
                const own = msg.userId === currentUserId;
                const priv = msg.isPrivate;

                return (
                  <div
                    key={i}
                    className={`flex flex-col ${own ? "items-end" : "items-start"
                      }`}
                  >
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      {priv && <Lock className="h-3 w-3" />}
                      <span className="font-medium">
                        {msg.senderName || msg.userId.slice(0, 6)}
                      </span>
                      <span>{fmtTime(msg.timestamp)}</span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 ${own
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                        } ${priv ? "border-2 border-yellow-500" : ""}`}
                    >
                      <p className="text-sm break-words">{msg.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border">
            {recipient && (
              <div className="mb-2 flex items-center gap-2 text-xs bg-yellow-500/10 text-yellow-600 px-2 py-1 rounded">
                <Lock className="h-3 w-3" />
                Private to {getRecipientName()}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-auto"
                  onClick={() => {
                    setRecipient(null);
                    setMessageText("");
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={messageText}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message… (@name for private)"
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={!messageText.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              Tip: Type @username to send a private message
            </p>
          </div>
        </div>
      )}
    </>
  );
}
