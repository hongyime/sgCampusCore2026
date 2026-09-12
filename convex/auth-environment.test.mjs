import assert from "node:assert/strict";
import test from "node:test";
import { verifyAuthEnvironment } from "../scripts/verify-convex-auth-env.mjs";

const frontend = {
  CAMPUSCORE_SCHOOL_CODE: "smu",
  CAMPUSCORE_ADMIN_ALLOWLIST: "admin@smu.edu.sg",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("synthetic.clerk.accounts.dev$").toString("base64")}`,
};
const backend = {
  CAMPUSCORE_SCHOOL_CODE: "smu",
  CAMPUSCORE_ADMIN_ALLOWLIST: "admin@smu.edu.sg",
  CLERK_FRONTEND_API_URL: "https://synthetic.clerk.accounts.dev",
};

test("deployment accepts equivalent authorization settings", () => {
  verifyAuthEnvironment(frontend, {
    ...backend,
    CAMPUSCORE_SCHOOL_CODE: "SMU",
    CAMPUSCORE_ADMIN_ALLOWLIST: " ADMIN@SMU.EDU.SG,admin@smu.edu.sg ",
    CLERK_FRONTEND_API_URL: backend.CLERK_FRONTEND_API_URL + "/",
  });
});
for (const [name, value] of [
  ["CAMPUSCORE_SCHOOL_CODE", "nus"],
  ["CAMPUSCORE_ADMIN_ALLOWLIST", ""],
  ["CAMPUSCORE_ADMIN_ALLOWLIST", "different@smu.edu.sg"],
  ["CLERK_FRONTEND_API_URL", "https://other.clerk.accounts.dev"],
  ["CLERK_FRONTEND_API_URL", undefined],
]) {
  test(`deployment rejects missing or mismatched ${name}: ${value ?? "absent"}`, () => {
    assert.throws(() =>
      verifyAuthEnvironment(frontend, { ...backend, [name]: value }),
    );
  });
}
