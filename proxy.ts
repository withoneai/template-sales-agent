import { NextResponse, type NextRequest } from "next/server";
import { connectConfigured, refreshAhead } from "@/lib/one";
import { SID_COOKIE, cookieOptions, newSid, readSessionCookie, sessionCookieWrites, unseal, withSession } from "@/lib/session";

// Runs before every page and API route (the Supabase SSR pattern, as in the
// Mastra inbound-router demo): give the browser a session id, and rotate the
// One token pair if it expires within ten minutes. The new cookie is written
// on the request (so the route sees it now) and on the response (so the
// browser keeps it).
export async function proxy(request: NextRequest) {
  const secure = request.nextUrl.protocol === "https:";
  const existingSid = request.cookies.get(SID_COOKIE)?.value;
  const sid = existingSid ?? newSid();

  let writes: ReturnType<typeof sessionCookieWrites> = [];
  const raw = connectConfigured ? readSessionCookie(request.cookies) : undefined;
  if (raw) {
    const tokens = unseal(raw);
    const r = await withSession(sid, tokens, async () => (tokens ? refreshAhead() : undefined));
    // Rotated, revoked, or unreadable (e.g. sealed with an old secret): rewrite it.
    if (r.dirty || !tokens) writes = sessionCookieWrites(r.tokens, request.cookies);
  }

  for (const w of writes) {
    if (w.maxAge === 0) request.cookies.delete(w.name);
    else request.cookies.set(w.name, w.value);
  }
  if (!existingSid) request.cookies.set(SID_COOKIE, sid);

  const response = NextResponse.next({ request });
  for (const w of writes) response.cookies.set({ name: w.name, value: w.value, maxAge: w.maxAge, ...cookieOptions(secure) });
  if (!existingSid) response.cookies.set({ name: SID_COOKIE, value: sid, maxAge: 60 * 60 * 24 * 365, ...cookieOptions(secure) });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
