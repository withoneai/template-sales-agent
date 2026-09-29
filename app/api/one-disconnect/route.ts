import { connectConfigured, oneConnect, userId } from "@/lib/one";
import { requestSession, serializeCookie } from "@/lib/session-next";
import { sessionCookieWrites, withSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Drops this app's copy of the grant: the sealed cookie. The grant itself
// stays in the user's One account until they revoke it there.
export async function POST(request: Request) {
  const { sid, tokens, jar } = await requestSession();
  if (connectConfigured && tokens) await withSession(sid, tokens, () => oneConnect().disconnect(userId()));
  const headers = new Headers({ "Content-Type": "application/json" });
  const secure = new URL(request.url).protocol === "https:";
  for (const w of sessionCookieWrites(null, jar)) headers.append("Set-Cookie", serializeCookie(w, secure));
  return new Response(JSON.stringify({ ok: true }), { headers });
}
