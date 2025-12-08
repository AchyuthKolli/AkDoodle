export const parseCardCode = (code) => {
    if (!code) return null;
    if (code === "JOKER") return { rank: "JOKER", suit: null };

    const suit = code.slice(-1);
    const rank = code.slice(0, -1);
    return { rank, suit };
};
