import { cookies } from "next/headers";
import { SID_COOKIE, cookieOptions, readSessionCookie, sessionCookieWrites, unseal, withSession, type CookieWrite } from "./session";
import { connectConfigured } from "./one";

/** This request's session id and tokens, as the proxy left them. */
export async function requestSession() {
  const jar = await cookies();
  const sid = jar.get(SID_COOKIE)?.value ?? "anonymous";
  const tokens = connectConfigured ? unseal(readSessionCookie(jar)) : null;
  return { sid, tokens, jar };
}

export function serializeCookie(w: CookieWrite, secure: boolean): string {
  const o = cookieOptions(secure);
  return [`${w.name}=${w.value}`, `Path=${o.path}`, `Max-Age=${w.maxAge}`, "HttpOnly", "SameSite=Lax", ...(o.secure ? ["Secure"] : [])].join("; ");
}

/**
 * Runs a route handler with the request's One session in scope. The proxy
 * already refreshed a pair that was close to expiring; if the handler still
 * changed the tokens (a callback, a disconnect, a late refresh), the new
 * sealed cookie rides out on this response.
 */
export async function inSessionRoute(request: Request, handler: () => Promise<Response>): Promise<Response> {
  const { sid, tokens, jar } = await requestSession();
  const { result, dirty, tokens: next } = await withSession(sid, tokens, handler);
  if (!dirty) return result;
  const headers = new Headers(result.headers);
  const secure = new URL(request.url).protocol === "https:";
  for (const w of sessionCookieWrites(next, jar)) headers.append("Set-Cookie", serializeCookie(w, secure));
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
}
