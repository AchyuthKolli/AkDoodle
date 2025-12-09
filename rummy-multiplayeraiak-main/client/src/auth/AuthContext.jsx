import React, { createContext, useContext, useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import { toast } from "sonner";

const AuthContext = createContext(null);

// Hard-coded fallback for dev/demo if env missing - typically effectively "null" or "invalid" to prevent crash
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);

    useEffect(() => {
        // Load persisted session
        const savedToken = localStorage.getItem("auth_token");
        const savedUser = localStorage.getItem("auth_user");

        console.log("🔐 AuthContext Init. Token?", !!savedToken, "User?", !!savedUser);

        if (savedToken && savedUser) {
            try {
                // Do NOT jwtDecode the Google Access Token (it's opaque).
                // Just trust the stored user profile for now.
                // (In a real app, we'd verify the token with the backend here, but for now this fixes persistence)
                setUser(JSON.parse(savedUser));
                setToken(savedToken);
                console.log("✅ Session restored from storage");
            } catch (e) {
                console.error("❌ Session restore failed:", e);
                localStorage.removeItem("auth_token");
                localStorage.removeItem("auth_user");
            }
        }
    }, []);

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        toast.success("Signed out");
    };

    // useGoogleLogin is now safe to call because main.jsx provides the Context globally
    const googleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            try {
                const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                });
                const profile = await res.json();

                // Map to our user shape
                const userPayload = {
                    id: profile.sub,
                    sub: profile.sub,
                    displayName: profile.name,
                    email: profile.email,
                    picture: profile.picture,
                    profileImageUrl: profile.picture
                };

                setUser(userPayload);
                setToken(tokenResponse.access_token);

                // Persist both
                localStorage.setItem("auth_token", tokenResponse.access_token);
                localStorage.setItem("auth_user", JSON.stringify(userPayload));

                toast.success(`Welcome, ${profile.given_name}!`);
            } catch (err) {
                console.error(err);
                toast.error("Login failed");
            }
        },
        onError: () => toast.error("Google Login Failed"),
    });

    const login = () => {
        if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE_CLIENT_ID") || GOOGLE_CLIENT_ID === "mock_client_id_to_prevent_crash") {
            toast.error("Google Login not configured");
            return;
        }
        googleLogin();
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, token }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
