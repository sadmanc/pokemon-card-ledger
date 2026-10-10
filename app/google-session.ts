import { cookies } from "next/headers";
import { env } from "./runtime-env";

const COOKIE_NAME = "card_ledger_google_session";
const SESSION_DAYS = 30;

type AuthEnv = {
  GOOGLE_SESSION_SECRET?: string;
};

export type GoogleSession = {
  email: string;
  name: string;
  picture: string;
  sub: string;
  exp: number;
};

function authEnv() {
  return env as unknown as AuthEnv;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(value: string) {
  const secret = authEnv().GOOGLE_SESSION_SECRET;
  if (!secret) throw new Error("GOOGLE_SESSION_SECRET is not configured.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

export async function createGoogleSession(user: Omit<GoogleSession, "exp">) {
  const payload: GoogleSession = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 };
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const token = `${body}.${await sign(body)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: SESSION_DAYS * 86400, path: "/" });
}

export async function getGoogleSession(): Promise<GoogleSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || signature !== await sign(body)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as GoogleSession;
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

export async function clearGoogleSession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: "/" });
}
