// Convex <-> Clerk auth integration (tech_design.md §1 Authentication).
//
// With this provider configured, every `ctx.auth.getUserIdentity()` call in a
// Convex function verifies the incoming Clerk session JWT by:
//   1. fetching Clerk's JWKS (https://<domain>/.well-known/jwks.json),
//   2. verifying the RS256 (JWS) signature against the matching public key,
//   3. checking the standard `exp` / `nbf` time claims.
// It NEVER decrypts the token — the payload is signed, not encrypted, and is
// not confidential by design. This is the verification described in §1; we do
// not hand-roll a verifier because Convex already does exactly this, and
// AGENTS.md asks us not to reinvent a primitive we can't explain more simply.
//
// CLERK_FRONTEND_API_URL is set as a CONVEX environment variable (per Convex's
// Clerk integration guide) — set with `npx convex env set CLERK_FRONTEND_API_URL
// https://<your-clerk-domain>`, NOT via Next's .env.local. `applicationID` must
// match the name of the JWT template you created in the Clerk dashboard
// (Configure → JWT Templates → "New template" → "Convex" preset defaults it to
// "convex").
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
