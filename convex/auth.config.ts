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
// CLERK_JWT_ISSUER_DOMAIN is set as a CONVEX environment variable (via
// `npx convex env set` or the Convex dashboard), not via Next's .env.local.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
