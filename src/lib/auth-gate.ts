import { safeEqual } from "./secret";

/**
 * HTTP Basic auth decision for the proxy, kept pure so it can be unit-tested.
 * Any username works; only the password is checked (constant-time).
 * Production without APP_PASSWORD is refused outright (Controller Ruling R10):
 * an open public deployment would let strangers spend the owner's Apify credit.
 */

export type AuthDecision =
  | { kind: "allow" }
  | { kind: "challenge" }
  | { kind: "unconfigured"; status: 503; message: string };

export function checkAuth(input: {
  password: string | undefined;
  vercelEnv: string | undefined;
  authorization: string | null;
}): AuthDecision {
  const { password, vercelEnv, authorization } = input;
  if (!password) {
    return vercelEnv === "production"
      ? { kind: "unconfigured", status: 503, message: "Set APP_PASSWORD to use this app." }
      : { kind: "allow" };
  }
  const header = authorization ?? "";
  if (!header.startsWith("Basic ")) return { kind: "challenge" };
  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return { kind: "challenge" }; // malformed base64: ask again rather than 500
  }
  const supplied = decoded.slice(decoded.indexOf(":") + 1);
  return safeEqual(supplied, password) ? { kind: "allow" } : { kind: "challenge" };
}
