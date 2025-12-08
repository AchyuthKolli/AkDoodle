import { useState, useEffect, useRef } from 'react';
import { apiClient } from 'app';
import { ChatMessage } from 'types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, X, Send, Lock, MessageSquare, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from "react-router-dom";   // ✅ ADDED

interface Props {
  tableId: string;
  currentUserId: string;
  players: Array<{ userId: string; displayName: string }>;
}

export default function ChatSidebar({ tableId, currentUserId, players }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [recipient, setRecipient] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();   // ✅ ADDED

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Poll new messages (4s)
  useEffect(() => {
    const fetchMessages = async () => {
      if (!tableId) return;
      try {
        const response = await apiClient.get_messages({ table_id: tableId });
        const data = await response.json();
        
        setMessages(data.messages || []);
        
        if (!isOpen) {
          const newMessages = (data.messages || []).filter((msg: ChatMessage) => 
            msg.user_id !== currentUserId && 
            new Date(msg.timestamp).getTime() > Date.now() - 4000
          );
          setUnreadCount(prev => prev + newMessages.length);
        }
      } catch (error) {
        console.error('Failed to fetch chat messages:', error);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 4000);
    return () => clearInterval(interval);
  }, [tableId, isOpen, currentUserId]);

  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  const sendMessage = async () => {
    if (!messageText.trim()) return;

    try {
      const response = await apiClient.send_message({
        table_id: tableId,
        message: messageText,
        is_private: !!recipient,
        recipient_id: recipient || undefined,
      });

      const newMessage = await response.json();
      setMessages([...messages, newMessage]);
      setMessageText('');
      setRecipient(null);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (value: string) => {
    setMessageText(value);
    const mentionMatch = value.match(/^@(\w+)/);

    if (mentionMatch) {
      const mentionedName = mentionMatch[1].toLowerCase();
      const player = players.find(p => 
        p.displayName.toLowerCase().startsWith(mentionedName)
      );
      if (player && player.userId !== currentUserId) {
        setRecipient(player.userId);
      }
    } else {
      setRecipient(null);
    }
  };

  const getRecipientName = () => {
    if (!recipient) return null;
    return players.find(p => p.userId === recipient)?.displayName;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Sidebar */}
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

          {/* 🔥 ADDED — Profile Button (Matches your design) */}
          <div className="p-4 border-b border-border">
            <Button
              onClick={() => navigate("/profile")}
              className="w-full bg-blue-900 hover:bg-blue-800 text-white"
            >
              My Profile
            </Button>
          </div>
          {/* END ADDED */}

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-3">
              {messages.map((msg) => {
                const isOwnMessage = msg.user_id === currentUserId;
                const isPrivate = msg.is_private;
                const isRecipient = msg.recipient_id === currentUserId;
                const isSender = msg.user_id === currentUserId;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      {isPrivate && <Lock className="h-3 w-3" />}
                      <span className="font-medium">{msg.sender_name}</span>
                      <span>{formatTimestamp(msg.created_at)}</span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 ${
                        isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      } ${isPrivate ? 'border-2 border-yellow-500 dark:border-yellow-600' : ''}`}
                    >
                      {isPrivate && (isSender || isRecipient) && (
                        <div className="text-xs italic opacity-80 mb-1">
                          {isSender
                            ? `To: ${players.find(p => p.userId === msg.recipient_id)?.displayName}`
                            : 'Private message'}
                        </div>
                      )}
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
              <div className="mb-2 flex items-center gap-2 text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 px-2 py-1 rounded">
                <Lock className="h-3 w-3" />
                <span>Private message to {getRecipientName()}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-auto"
                  onClick={() => {
                    setRecipient(null);
                    setMessageText('');
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
                onChange={(e) => handleInputChange(e.target.value)}
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
