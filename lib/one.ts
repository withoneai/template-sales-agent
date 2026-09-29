import "server-only";
import { createOneConnect, type OneConnect } from "@withone/connect/server";
import { cookieTokenStore, currentSid, REFRESH_AHEAD_MS } from "./session";

/**
 * How the app reaches One: One Connect. The visitor clicks Connect, grants
 * this app scoped access to tools in THEIR One account, and every tool call
 * runs under that grant. One refuses anything outside it.
 *
 * With no Connect app configured, the app runs in demo mode (./demo.ts).
 */

/**
 * The session id of the request in scope, which Connect uses as the user id.
 * A real embed would use its own signed-in user's id here instead.
 */
export function userId(): string {
  const sid = currentSid();
  if (!sid) throw new Error("No session in scope");
  return sid;
}

/** Called by the proxy: rotate the pair if it expires soon, so no route has to. */
export async function refreshAhead(): Promise<void> {
  const c = oneConnect();
  const tokens = await c.getTokens(userId());
  if (tokens && tokens.expiresAt - Date.now() < REFRESH_AHEAD_MS) {
    try {
      await c.refreshTokens(userId());
    } catch {
      // refresh_failed: revoked or expired. The store is cleared, so the proxy writes a signed-out cookie.
    }
  }
}

export type Access =
  | { policy: "full" }
  | { policy: "methods"; methods: string[] }
  | { policy: "actions"; actions: { actionId: string; title: string; method: string }[] };

export type Connection = { key: string; platform: string; title?: string; access: Access };

export type ActionCall = {
  connectionKey: string;
  actionId: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

export type ActionResult = { status: number; ok: boolean; blockedByGrant: boolean; data: unknown };

export type CatalogAction = { _id: string; title: string; method: string; path: string };

export interface OneBackend {
  mode: "connect";
  isConnected(): Promise<boolean>;
  listConnections(): Promise<Connection[]>;
  runAction(call: ActionCall): Promise<ActionResult>;
  /** Every catalog action for a platform: what exists, not what the grant allows. */
  listActions(platform: string): Promise<CatalogAction[]>;
  /** The action's markdown docs (parameters, rules), or null. */
  getKnowledge(actionId: string): Promise<ActionKnowledge | null>;
  /** Who is connected, or null when One will not say. */
  getUser(): Promise<OneUser | null>;
  /** Any authenticated GET/POST on One's /v1 API (the path starts with "/"). */
  request(path: string, init?: RequestInit): Promise<Response>;
}

export type OneUser = { name?: string; email?: string; avatar?: string };

/**
 * Who is signed in, from /v1/users/me (Connect, needs `user:profile:read`)
 * or /v1/users/whoami (dev). Null when One will not say: a grant made before
 * this app asked for the profile scope gets a 403 until the user reconnects.
 */
async function userFrom(response: Response): Promise<OneUser | null> {
  if (!response.ok) return null;
  const body = await response.json();
  const u = body?.user ?? body;
  // whoami returns { user: { name, email } }; /users/me returns { email, firstName, lastName, avatar, username }.
  const name = u?.name ?? ([u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.username || undefined);
  const avatar = typeof u?.avatar === "string" && /^https?:\/\//.test(u.avatar) ? u.avatar : undefined;
  return u?.email || name ? { name, email: u.email ?? undefined, avatar } : null;
}

export type ActionKnowledge = CatalogAction & { platform: string; knowledge: string; tags: string[] };

async function knowledgeFrom(response: Response): Promise<ActionKnowledge | null> {
  if (!response.ok) return null;
  const row = (await response.json())?.rows?.[0];
  if (!row?.knowledge) return null;
  return { _id: String(row._id), title: String(row.title), method: String(row.method), path: String(row.path), platform: String(row.connectionPlatform), knowledge: String(row.knowledge), tags: Array.isArray(row.tags) ? row.tags.map(String) : [] };
}

// ---------------------------------------------------------------- connect

export const connectConfigured = Boolean(process.env.ONE_CLIENT_ID && process.env.ONE_CLIENT_SECRET);

let connectClient: OneConnect | null = null;

export function oneConnect(): OneConnect {
  if (!connectConfigured) throw new Error("One Connect is not configured (ONE_CLIENT_ID / ONE_CLIENT_SECRET).");
  connectClient ??= createOneConnect({
    clientId: process.env.ONE_CLIENT_ID!,
    clientSecret: process.env.ONE_CLIENT_SECRET!,
    redirectUri: process.env.ONE_REDIRECT_URI || "http://localhost:3000/api/one/callback",
    permissionSet: process.env.ONE_PERMISSION_SET || undefined,
    // Tokens live in a sealed cookie in the visitor's browser, never on this
    // server (see ./session.ts). Each browser session is its own "user".
    oneApiUrl: process.env.ONE_API_URL || undefined,
    // The SDK's default connection scopes, plus the signed-in user's profile
    // (/v1/users/me), so the agent knows who it is working for.
    scopes: [
      "user:profile:read",
      "user:connections:read",
      "user:connections:write",
      "org:connections:read",
      "org:connections:write",
      "project:connections:read",
      "project:connections:write",
    ],
    tokenStore: cookieTokenStore,
  });
  return connectClient;
}

const connectBackend: OneBackend = {
  mode: "connect",
  isConnected: () => oneConnect().isConnected(userId()),
  listConnections: async () => {
    if (!(await oneConnect().isConnected(userId()))) return [];
    const rows = await oneConnect().listConnections(userId());
    return rows.map((r) => ({ key: r.key, platform: r.platform, title: r.title ?? r.name, access: r.access }));
  },
  runAction: (call) => oneConnect().runAction(userId(), call),
  listActions: (platform) => oneConnect().listActions(userId(), platform),
  getKnowledge: async (actionId) => knowledgeFrom(await oneConnect().fetch(userId(), `/knowledge?_id=${encodeURIComponent(actionId)}`)),
  request: (path, init) => oneConnect().fetch(userId(), path, init),
  getUser: async () => {
    if (!(await oneConnect().isConnected(userId()))) return null;
    return userFrom(await oneConnect().fetch(userId(), "/users/me"));
  },
};

/** No Connect app configured: the UI runs on scripted demo data instead. */
export const demoMode = !connectConfigured;

export function one(): OneBackend {
  return connectBackend;
}
