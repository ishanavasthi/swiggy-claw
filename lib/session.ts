// iron-session config (Next 16: cookies() is async — await it).
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SwiggySession {
  swiggyToken?: string;
  tokenExpiry?: number;
  pkceVerifier?: string;
  pkceState?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me-32+chars-padding",
  cookieName: "swiggy-sess",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};

export async function getSession() {
  return getIronSession<SwiggySession>(await cookies(), sessionOptions);
}

export class AuthError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

export function isMock(): boolean {
  return process.env.SWIGGY_USE_MOCK !== "false";
}

/** Returns a valid Swiggy token or throws AuthError. In mock mode, mints a dev token. */
export async function requireAuth(): Promise<string> {
  if (isMock()) return "mock-dev-token";
  const session = await getSession();
  if (!session.swiggyToken || (session.tokenExpiry && Date.now() > session.tokenExpiry)) {
    throw new AuthError();
  }
  return session.swiggyToken;
}
