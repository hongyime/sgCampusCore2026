import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const normalizeAllowlist = (value) =>
  [
    ...new Set(
      (value ?? "")
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean),
    ),
  ].sort();

export function verifyAuthEnvironment(frontend, backend) {
  const school = (value) => (value || "smu").toLowerCase();
  if (
    school(frontend.CAMPUSCORE_SCHOOL_CODE) !==
    school(backend.CAMPUSCORE_SCHOOL_CODE)
  ) {
    throw new Error("School configuration differs between Vercel and Convex.");
  }
  const admins = normalizeAllowlist(backend.CAMPUSCORE_ADMIN_ALLOWLIST);
  if (
    !admins.length ||
    JSON.stringify(admins) !==
      JSON.stringify(normalizeAllowlist(frontend.CAMPUSCORE_ADMIN_ALLOWLIST))
  ) {
    throw new Error(
      "A matching, nonempty administrator allowlist is required in Vercel and Convex.",
    );
  }
  const publishable = frontend.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const issuer = Buffer.from(
    publishable.replace(/^pk_(test|live)_/, ""),
    "base64",
  )
    .toString()
    .replace(/\$$/, "");
  if (
    !issuer ||
    backend.CLERK_FRONTEND_API_URL?.replace(/\/$/, "") !== `https://${issuer}`
  ) {
    throw new Error(
      "Clerk issuer configuration differs between Vercel and Convex.",
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const branch = process.env.VERCEL_GIT_COMMIT_REF;
    if (!branch || !process.env.CONVEX_DEPLOY_KEY?.startsWith("preview:")) {
      throw new Error(
        "The current deployment requires its Git branch and Convex preview deploy key.",
      );
    }
    const backend = {};
    for (const name of [
      "CAMPUSCORE_SCHOOL_CODE",
      "CAMPUSCORE_ADMIN_ALLOWLIST",
      "CLERK_FRONTEND_API_URL",
    ]) {
      backend[name] = execFileSync(
        process.execPath,
        [
          "node_modules/convex/bin/main.js",
          "env",
          "get",
          name,
          "--preview-name",
          branch,
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
        },
      ).trim();
    }
    verifyAuthEnvironment(process.env, backend);
    console.log(
      "Convex authorization configuration matches this Vercel deployment.",
    );
  } catch (error) {
    // A child-process error can contain captured environment values. Never log it.
    console.error(
      error && typeof error === "object" && "status" in error
        ? "Could not read the selected Convex deployment's authorization configuration."
        : error.message,
    );
    process.exitCode = 1;
  }
}
