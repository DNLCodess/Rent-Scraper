import { describe, expect, it } from "vitest";
import { checkAuth } from "./auth-gate";

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

describe("checkAuth", () => {
  it("lets everything through when APP_PASSWORD is unset outside production", () => {
    expect(checkAuth({ password: undefined, vercelEnv: undefined, authorization: null })).toEqual({ kind: "allow" });
    expect(checkAuth({ password: "", vercelEnv: "preview", authorization: null })).toEqual({ kind: "allow" });
    expect(checkAuth({ password: undefined, vercelEnv: "development", authorization: null })).toEqual({ kind: "allow" });
  });
  it("refuses with 503 in production when APP_PASSWORD is unset (R10)", () => {
    expect(checkAuth({ password: undefined, vercelEnv: "production", authorization: null })).toEqual({
      kind: "unconfigured", status: 503, message: "Set APP_PASSWORD to use this app.",
    });
    expect(checkAuth({ password: "", vercelEnv: "production", authorization: basic("a", "") }).kind).toBe("unconfigured");
  });
  it("accepts the right password with any username", () => {
    expect(checkAuth({ password: "pw", vercelEnv: "production", authorization: basic("me", "pw") })).toEqual({ kind: "allow" });
    expect(checkAuth({ password: "p:w", vercelEnv: undefined, authorization: basic("", "p:w") })).toEqual({ kind: "allow" });
  });
  it("asks for credentials on a wrong, missing or malformed header", () => {
    for (const authorization of [null, "", basic("me", "nope"), "Bearer pw", "Basic !!!not-base64%%", "Basic bm9jb2xvbg=="]) {
      expect(checkAuth({ password: "pw", vercelEnv: "production", authorization }).kind).toBe("challenge");
    }
  });
});
