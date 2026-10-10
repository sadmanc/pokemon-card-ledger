import { clearGoogleSession } from "../../../google-session";

export async function POST() {
  await clearGoogleSession();
  return Response.json({ ok: true });
}
