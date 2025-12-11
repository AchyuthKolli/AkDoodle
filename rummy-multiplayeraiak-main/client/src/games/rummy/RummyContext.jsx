import React, { createContext, useContext, useMemo } from "react";

const RummyContext = createContext(null);

export const useRummy = () => {
    const context = useContext(RummyContext);
    if (!context) {
        throw new Error("useRummy must be used within a RummyProvider");
    }
    return context;
};

export const RummyProvider = ({
    players = [],
    activeUserId = null,
    currentUserId = null,
    children
}) => {
    // Create a map for fast lookup
    const playerMap = useMemo(() => {
        const map = new Map();
        players.forEach(p => map.set(p.user_id, p));
        return map;
    }, [players]);

    const value = {
        players,
        activeUserId,
        currentUserId,
        getPlayer: (userId) => playerMap.get(userId) || null,
        isMyTurn: activeUserId === currentUserId,
    };

    return (
        <RummyContext.Provider value={value}>
            {children}
        </RummyContext.Provider>
    );
};
