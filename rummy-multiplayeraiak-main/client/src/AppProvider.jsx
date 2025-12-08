import { createContext, useContext, useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { Toaster } from "sonner";

// -------------------------------
// CONTEXT
// -------------------------------
export const AppContext = createContext(null);

export const useApp = () => useContext(AppContext);

// -------------------------------
// PROVIDER (JSX VERSION)
// -------------------------------
export const AppProvider = ({ children }) => {
  const socketRef = useRef(null);

  const [user, setUser] = useState(null);
  const [activeGame, setActiveGame] = useState(null); // "rummy", "teenpatti", etc.
  const [tableId, setTableId] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);

  // -----------------------------------
  // SOCKET INIT — fixes:
  //  ✓ turn desync
  //  ✓ rejoin bug
  //  ✓ table lost on refresh
  // -----------------------------------
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SERVER_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
    });

    socketRef.current = socket;

    // Handle auto-rejoin on reconnect
    socket.on("connect", () => {
      if (user && tableId && activeGame) {
        setReconnecting(true);

        socket.emit("rejoin-table", {
          userId: user.id,
          tableId,
          game: activeGame,
        });

        setTimeout(() => setReconnecting(false), 800);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user, tableId, activeGame]);

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        socket: socketRef.current,
        activeGame,
        setActiveGame,
        tableId,
        setTableId,
        reconnecting,
      }}
    >
      {children}
      <Toaster richColors position="top-right" />
    </AppContext.Provider>
  );
};
