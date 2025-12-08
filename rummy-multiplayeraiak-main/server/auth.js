// server/auth.js
// Middleware to verify Google ID token and provide req.user
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const { fetchrow, execute } = require("./db");
dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
if (!GOOGLE_CLIENT_ID) {
  console.warn("GOOGLE_CLIENT_ID not set — Google auth will fail");
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper: verify Google ID token and return payload
async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID not configured");
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}

// Middleware: expect Authorization: Bearer <id_token OR jwt>
// 1) If bearer is Google id token (contains 'email_verified' etc), verify with Google and issue local JWT.
// 2) If bearer is our JWT, verify and attach user.
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
  const parts = auth.split(" ");
  if (parts.length !== 2) return res.status(401).json({ error: "Invalid Authorization header" });
  const token = parts[1];

  // Try verifying as our own JWT first
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
    return next();
  } catch (err) {
    // Not a local JWT: try Google id token verification
  }

  try {
    const googlePayload = await verifyGoogleIdToken(token);
    // googlePayload contains sub, email, name, picture, email_verified etc.
    const userId = googlePayload.sub; // use Google's sub as stable id
    // Optional: upsert user profile into profiles table for display_name and picture
    try {
      // create profiles table if not exists is outside scope; we assume it's present
      await execute(
        `INSERT INTO profiles (user_id, display_name, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
         SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url`,
        userId,
        googlePayload.name || null,
        googlePayload.picture || null
      );
    } catch (e) {
      console.warn("profile upsert failed:", e.message || e);
    }

    // Issue a local JWT for subsequent calls
    const localJwt = jwt.sign(
      {
        sub: userId,
        email: googlePayload.email,
        name: googlePayload.name,
        picture: googlePayload.picture,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Attach user info to request
    req.user = {
      id: userId,
      email: googlePayload.email,
      name: googlePayload.name,
      picture: googlePayload.picture,
      jwt: localJwt,
    };

    // For convenience, send the new JWT header back (if API clients want to catch it)
    res.setHeader("X-Auth-Token", localJwt);

    return next();
  } catch (err) {
    console.error("Auth verify failed:", err && err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = {
  requireAuth,
  verifyGoogleIdToken,
};
