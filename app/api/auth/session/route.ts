import { getGoogleSession } from "../../../google-session";

export async function GET() {
  const session = await getGoogleSession();
  return session ? Response.json({ user: session }) : Response.json({ user: null }, { status: 401 });
}
