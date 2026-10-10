import { cookies } from "next/headers";
import { env } from "../../runtime-env";

type AuthEnv = { GOOGLE_CLIENT_ID?: string };

export async function GET(request: Request) {
  const clientId = (env as unknown as AuthEnv).GOOGLE_CLIENT_ID;
  if (!clientId) return new Response("Google sign-in is not configured.", { status: 503 });
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  (await cookies()).set("card_ledger_google_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  const redirectUri = `${url.origin}/auth/google/callback`;
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.searchParams.set("client_id", clientId);
  google.searchParams.set("redirect_uri", redirectUri);
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email profile");
  google.searchParams.set("state", state);
  google.searchParams.set("access_type", "online");
  return Response.redirect(google.toString(), 302);
}
