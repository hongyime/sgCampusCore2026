import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isSchoolMemberEmail, isAdminEmail } from "./config/school";

// The PUBLIC dashboard (/, /dashboard) is intentionally open (PRD §3.6).
// Two tiers of protected routes (per-school template, Session-1 decision):
//   - ADMIN routes (/admin, CSOC takeover/acknowledge): require a verified
//     staff-domain email that is ALSO on CAMPUSCORE_ADMIN_ALLOWLIST.
//   - MEMBER routes (/volunteer, resolve): require any verified email on this
//     deployment's school (student or staff domain).
// The authoritative domain restriction is the per-instance Clerk dashboard
// gate (see WAITING_ON_HUMAN.md); the checks below are defense-in-depth.
const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);
const isMemberRoute = createRouteMatcher([
  "/volunteer(.*)",
  "/api/resolve(.*)",
]);

function claimEmail(sessionClaims: Record<string, unknown> | null): string {
  // Read only the email claim — never log the whole token (AGENTS.md: the
  // institutional email is PII even though the JWT is signed, not encrypted).
  return (
    ((sessionClaims?.email as string | undefined) ??
      (sessionClaims?.["primary_email"] as string | undefined) ??
      "")
  ).toLowerCase();
}

export default clerkMiddleware(async (auth, req) => {
  const admin = isAdminRoute(req);
  const member = isMemberRoute(req);
  if (!admin && !member) return NextResponse.next();

  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return (await auth()).redirectToSignIn();
  }

  const email = claimEmail(sessionClaims as Record<string, unknown> | null);

  if (admin && !isAdminEmail(email)) {
    return new NextResponse(
      "Forbidden: authorized school administrator account required.",
      { status: 403 },
    );
  }
  if (member && !isSchoolMemberEmail(email)) {
    return new NextResponse(
      "Forbidden: institutional account for this school required.",
      { status: 403 },
    );
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
