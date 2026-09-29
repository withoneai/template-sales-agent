import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

// The One Connect session lives in the browser, the way Supabase SSR does it:
//
//   cookie   sa_session  the access + refresh token pair, AES-256-GCM sealed
//                        with a key derived from ONE_CLIENT_SECRET; httpOnly,
//                        SameSite=Lax, Secure on https. Nothing on the server.
//   proxy    proxy.ts refreshes the pair BEFORE a request reaches a page
//                        or route, and writes the new cookie on both the
//                        request and the response. Routes never rotate tokens
//                        mid-stream, where the new cookie could not be set.
//
// Why a refresh token in a cookie is acceptable here: One's token endpoint
// needs the client secret to use it, and the secret never leaves the server.
// A stolen cookie is a sealed blob; a stolen access token is bearer for at
// most an hour, within what the user granted.
//
// One's refresh tokens rotate with no grace period (a used one is revoked at
// once). Supabase covers concurrent refreshes with a server-side "reuse
// interval"; here the app does it: a refresh records old -> new for a few
// minutes, so a second tab arriving with the old token gets the new pair
// instead of tripping reuse detection.

export const SESSION_COOKIE = "sa_session";
export const SID_COOKIE = "sa_sid";
const MAX_COOKIE = 3800; // stay under the 4096-byte browser limit; chunk above it

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };
type Store = { sid: string; tokens: Tokens | null; dirty: boolean };

const als = new AsyncLocalStorage<Store>();

function key(): Buffer {
  const secret = process.env.ONE_CLIENT_SECRET;
  if (!secret) throw new Error("ONE_CLIENT_SECRET is required to seal the session cookie");
  return createHash("sha256").update(`one-sales-agent/session/v1/${secret}`).digest();
}

export function seal(tokens: Tokens): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal(value: string | undefined): Tokens | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return null; // tampered, or sealed with an old secret: treat as signed out
  }
}

type CookieReader = { get(name: string): { value: string } | undefined; getAll(): { name: string; value: string }[] };

/** Reads the (possibly chunked) session cookie. */
export function readSessionCookie(cookies: CookieReader): string | undefined {
  const whole = cookies.get(SESSION_COOKIE)?.value;
  if (whole) return whole;
  const chunks = cookies
    .getAll()
    .filter((c) => c.name.startsWith(`${SESSION_COOKIE}.`))
    .sort((a, b) => Number(a.name.split(".")[1]) - Number(b.name.split(".")[1]));
  return chunks.length ? chunks.map((c) => c.value).join("") : undefined;
}

export type CookieWrite = { name: string; value: string; maxAge: number };

/** The cookies to write for a session (chunked if large), plus deletions for stale chunks. */
export function sessionCookieWrites(tokens: Tokens | null, existing: CookieReader): CookieWrite[] {
  const stale = existing.getAll().filter((c) => c.name === SESSION_COOKIE || c.name.startsWith(`${SESSION_COOKIE}.`));
  const writes: CookieWrite[] = stale.map((c) => ({ name: c.name, value: "", maxAge: 0 }));
  if (!tokens) return writes;
  const value = seal(tokens);
  const maxAge = 60 * 60 * 24 * 30; // the refresh token decides the real lifetime
  const parts = value.length <= MAX_COOKIE ? [value] : value.match(new RegExp(`.{1,${MAX_COOKIE}}`, "g"))!;
  const names = parts.length === 1 ? [SESSION_COOKIE] : parts.map((_, i) => `${SESSION_COOKIE}.${i}`);
  const out = writes.filter((w) => !names.includes(w.name));
  names.forEach((name, i) => out.push({ name, value: parts[i], maxAge }));
  return out;
}

export function cookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
}

export function newSid(): string {
  return randomUUID();
}

/** Runs `fn` with this request's session available to the Connect token store. */
export async function withSession<T>(sid: string, tokens: Tokens | null, fn: () => Promise<T>) {
  const store: Store = { sid, tokens, dirty: false };
  const result = await als.run(store, fn);
  return { result, tokens: store.tokens, dirty: store.dirty };
}

export function currentSid(): string | null {
  return als.getStore()?.sid ?? null;
}

// The Connect token store, backed by the request's cookie session.
export const cookieTokenStore = {
  saveTokens: async (userId: string, tokens: Tokens) => {
    const s = als.getStore();
    if (!s || s.sid !== userId) throw new Error("No session in scope to save tokens to");
    if (s.tokens && s.tokens.refreshToken !== tokens.refreshToken) remember(s.tokens.refreshToken, tokens);
    s.tokens = tokens;
    s.dirty = true;
  },
  loadTokens: async (userId: string): Promise<Tokens | null> => {
    const s = als.getStore();
    if (!s || s.sid !== userId || !s.tokens) return null;
    // Another request already rotated this pair: use the new one.
    return rotated(s.tokens.refreshToken) ?? s.tokens;
  },
  clearTokens: async (userId: string, failed?: Tokens) => {
    const s = als.getStore();
    if (!s || s.sid !== userId) return;
    // A dead pair only clears itself: a newer pair saved meanwhile survives.
    if (failed && s.tokens && s.tokens.refreshToken !== failed.refreshToken) return;
    s.tokens = null;
    s.dirty = true;
  },
};

// old refresh token (hashed) -> the pair it rotated into, for a few minutes
const REUSE_WINDOW_MS = 5 * 60_000;
const rotations = new Map<string, { tokens: Tokens; at: number }>();
const h = (t: string) => createHash("sha256").update(t).digest("hex");

function remember(oldRefresh: string, next: Tokens) {
  const now = Date.now();
  for (const [k, v] of rotations) if (now - v.at > REUSE_WINDOW_MS) rotations.delete(k);
  rotations.set(h(oldRefresh), { tokens: next, at: now });
}

function rotated(refresh: string): Tokens | null {
  const hit = rotations.get(h(refresh));
  if (!hit || Date.now() - hit.at > REUSE_WINDOW_MS) return null;
  // Follow the chain in case it rotated more than once.
  return rotated(hit.tokens.refreshToken) ?? hit.tokens;
}

/** Refresh ahead of time: a run should never need to rotate mid-response. */
export const REFRESH_AHEAD_MS = 10 * 60_000;
