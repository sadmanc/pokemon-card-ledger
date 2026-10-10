import { cookies } from "next/headers";
import { createGoogleSession } from "../../../google-session";
import { env } from "../../../runtime-env";

type AuthEnv = { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GOOGLE_ALLOWED_EMAIL?: string };
type GoogleUser = { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };

export async function GET(request: Request) {
  const config = env as unknown as AuthEnv;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const expectedState = (await cookies()).get("card_ledger_google_state")?.value;
  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return new Response("Google sign-in state was invalid. Please try again.", { status: 400 });
  }
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_ALLOWED_EMAIL) {
    return new Response("Google sign-in is not fully configured.", { status: 503 });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/auth/google/callback`, grant_type: "authorization_code" }),
  });
  if (!tokenResponse.ok) return new Response("Google sign-in could not be completed.", { status: 401 });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return new Response("Google did not return an access token.", { status: 401 });

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!userResponse.ok) return new Response("Google account details could not be read.", { status: 401 });
  const user = await userResponse.json() as GoogleUser;
  if (!user.email || user.email.toLowerCase() !== config.GOOGLE_ALLOWED_EMAIL.toLowerCase() || user.email_verified !== true || !user.sub) {
    return new Response("This Google account is not allowed to access Card Ledger.", { status: 403 });
  }

  await createGoogleSession({ email: user.email.toLowerCase(), name: user.name ?? user.email, picture: user.picture ?? "", sub: user.sub });
  const response = Response.redirect(`${url.origin}/`, 302);
  (await cookies()).set("card_ledger_google_state", "", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: "/" });
  return response;
}
