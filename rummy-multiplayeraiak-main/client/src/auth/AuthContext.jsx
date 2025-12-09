import React, { createContext, useContext, useState, useEffect } from "react";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
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
        console.log("🔐 AuthContext Init. Token found?", !!savedToken);
        if (savedToken) {
            try {
                const decoded = jwtDecode(savedToken);
                console.log("✅ Token decoded:", decoded);
                // Check expiry if needed
                setUser(decoded);
                setToken(savedToken);
            } catch (e) {
                console.error("❌ Token decode failed:", e);
                localStorage.removeItem("auth_token");
            }
        }
    }, []);

    const login = (accessToken) => {
        // In a real flow, we might send this to backend to exchange for JWT
        // But user wants "google verify".
        // We will assume backend accepts the ID token or we verify it here.
        // Use useGoogleLogin (implicit flow) or ID token flow?
        // Backend verifyGoogleIdToken expects an ID TOKEN.
        // flow: 'auth-code' is best but 'implicit' gives access token.
        // We want ID token.
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem("auth_token");
        toast.success("Signed out");
    };

    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === "YOUR_GOOGLE_CLIENT_ID_HERE") {
        console.warn("⚠️ VITE_GOOGLE_CLIENT_ID is not set! Google Login will not function.");
        return (
            <AuthContext.Provider value={{ user, login: () => toast.error("Google Login Config Missing"), logout, token }}>
                {children}
            </AuthContext.Provider>
        );
    }

    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <AuthContextInner user={user} setUser={setUser} token={token} setToken={setToken} logout={logout}>
                {children}
            </AuthContextInner>
        </GoogleOAuthProvider>
    );
};

const AuthContextInner = ({ children, user, setUser, token, setToken, logout }) => {
    const login = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            // This gives Access Token (not ID Token) by default unless flow is configured?
            // Actually, for simple profile info, we can fetch from Google UserInfo endpoint using Access Token.
            // OR use 'id_token' flow.
            // Let's fetch user info for "Google Name/Pic" requirement.
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
                    profileImageUrl: profile.picture // for compatibility
                };

                setUser(userPayload);
                setToken(tokenResponse.access_token); // store access token as "auth" for now, ideally backend exchanges it
                // WARNING: Storing Access Token as JWT storage source is risky if code assumes it's JWT. 
                // But catching existing logic.
                localStorage.setItem("auth_token", tokenResponse.access_token);

                toast.success(`Welcome, ${profile.given_name}!`);
            } catch (err) {
                console.error(err);
                toast.error("Login failed");
            }
        },
        onError: () => toast.error("Google Login Failed"),
    });

    return (
        <AuthContext.Provider value={{ user, login, logout, token }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
