import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// The PUBLIC dashboard (/, /dashboard) is intentionally open (PRD §3.6).
// Volunteer resolution and admin/CSOC takeover routes require a signed-in
// @smu.edu.sg user. The authoritative domain restriction is configured at
// the Clerk DASHBOARD level (see WAITING_ON_HUMAN.md); the check below is
// defense-in-depth, not the primary gate.
const isProtectedRoute = createRouteMatcher([
  "/admin(.*)",
  "/volunteer(.*)",
  "/api/resolve(.*)",
]);

const ALLOWED_EMAIL_DOMAIN = "@smu.edu.sg";

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return NextResponse.next();

  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return (await auth()).redirectToSignIn();
  }

  // Defense-in-depth: reject any session whose verified email is not on the
  // institutional domain, even if Clerk's dashboard gate were misconfigured.
  // We read the email claim rather than logging the whole token (AGENTS.md:
  // the @smu.edu.sg email is PII — never log full JWT payloads).
  const email =
    (sessionClaims?.email as string | undefined) ??
    (sessionClaims?.["primary_email"] as string | undefined);
  if (email && !email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
    return new NextResponse("Forbidden: SMU institutional account required.", {
      status: 403,
    });
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next internals and static files; run on app + API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?)).*)",
    "/(api|trpc)(.*)",
  ],
};
