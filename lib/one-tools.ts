import "server-only";
import type { Access, CatalogAction, Connection, OneBackend } from "./one";

/**
 * The agent's tools are One's own MCP tools: same names, same parameters,
 * same four-step workflow as the hosted server (core-rust/mcp) and the CLI
 * (`one list` -> `actions search` -> `actions knowledge` -> `actions execute`).
 *
 *   list_one_integrations        what the user's grant reaches, with access
 *   search_one_platform_actions  find an action on a connected platform
 *   get_one_action_knowledge     read its docs (mandatory before executing)
 *   execute_one_action           run it through /v1/passthrough
 *
 * Nothing here knows about Attio, HubSpot, Gmail or Resend. The sales
 * behaviour lives in the system prompt; the reach lives in the grant.
 */

export const ONE_TOOLS = [
  {
    name: "list_one_integrations",
    description:
      "Use this when you need to know which platforms the user has connected on One, and always before searching or executing. Lists the active connections with their `key` (the `connection_key` for execution) and the `access` each grant confers: `full`, a set of allowed HTTP `methods`, or a specific list of `actions` (each with `actionId`, `title`, `method`). When a connection is action-scoped, its `actions` are exactly what may run, so you need not search. Do not guess connection keys; only use values returned here.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "search_one_platform_actions",
    description:
      "Use this when you need to find an API action on a connected platform (e.g. \"send an email\" on gmail). Searches the platform's action catalog, scoped to the grant. Returns up to 5 matching actions with their `actionId`, title, HTTP method, and path. For a connection whose `access` already enumerates its actions, use that list instead of searching.",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: { type: "string", description: "The kebab-case platform to search (e.g. \"attio\", \"hubspot\", \"gmail\", \"resend\")." },
        query: { type: "string", description: "Free-text search query matched against action names and descriptions." },
      },
      required: ["platform", "query"],
    },
  },
  {
    name: "get_one_action_knowledge",
    description:
      "Use this immediately before executing an action: it fetches the action's knowledge document (required parameters, validation rules, and platform-specific caveats). Never run an action without reading this first.",
    input_schema: {
      type: "object" as const,
      properties: {
        action_id: { type: "string", description: "The action's system id returned by search_one_platform_actions (the actionId field)." },
        platform: { type: "string", description: "The kebab-case platform identifier (e.g. \"attio\", \"gmail\")." },
      },
      required: ["action_id", "platform"],
    },
  },
  {
    name: "execute_one_action",
    description:
      "Use this to run an API action on a platform the user has connected on One, after get_one_action_knowledge documented its inputs. Takes the `action_id` from search_one_platform_actions (or the connection's `access` list) and the `connection_key` from list_one_integrations. This can create, modify, delete, or send data on the external platform; every call that is not a GET is shown to the user for approval before it runs. Do not use it to probe connectivity or retry a failed write blindly.",
    input_schema: {
      type: "object" as const,
      properties: {
        action_id: { type: "string", description: "The action's system id returned by search_one_platform_actions (the actionId field)." },
        connection_key: { type: "string", description: "The connection key for the caller's connection (from list_one_integrations)." },
        data: { type: "object", description: "The request body, sent as JSON." },
        path_variables: { type: "object", description: "Substitutions for {var} / {{var}} placeholders in the action path." },
        query_params: { type: "object", description: "Query-string parameters appended to the request." },
        summary: {
          type: "string",
          description: "One plain sentence the user reads on the approval card, e.g. \"Send the follow-up to Dana Ruiz at Acme from your Gmail.\"",
        },
      },
      required: ["action_id", "connection_key", "summary"],
    },
  },
];

import type { PendingWrite, Receipt, ToolName } from "./one-tools-types";
export type { PendingWrite, Receipt, ToolName };

export type ToolOutcome = { content: unknown; receipt: Receipt; isError?: boolean };

// ------------------------------------------------------------------ catalog

const catalogCache = new Map<string, { at: number; actions: CatalogAction[] }>();
const CATALOG_TTL = 10 * 60_000;

async function catalog(backend: OneBackend, platform: string) {
  const hit = catalogCache.get(platform);
  if (hit && Date.now() - hit.at < CATALOG_TTL) return hit.actions;
  const actions = await backend.listActions(platform);
  catalogCache.set(platform, { at: Date.now(), actions });
  return actions;
}

export function allowedBy(access: Access, action: { _id: string; method: string }) {
  if (access.policy === "full") return true;
  if (access.policy === "methods") return access.methods.includes(action.method.toUpperCase());
  return access.actions.some((x) => x.actionId === action._id);
}

const STOP = new Set(["a", "an", "the", "my", "me", "to", "for", "of", "in", "on", "and", "or", "with", "from", "all", "some", "i", "by"]);
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);

/** Local ranking over the catalog, for when One's hosted search returns nothing (HubSpot, today). */
function rank(actions: CatalogAction[], query: string) {
  const q = words(query);
  return actions
    .map((a) => {
      const title = new Set(words(a.title));
      const path = a.path.toLowerCase();
      let score = 0;
      for (const w of q) {
        if (title.has(w)) score += 3;
        else if ([...title].some((t) => t.startsWith(w) || w.startsWith(t))) score += 1.5;
        if (path.includes(w)) score += 1;
      }
      // Prefer the stable, named endpoints over batch and archive variants.
      if (/batch|archive|gdpr|merge/i.test(a.title)) score -= 1;
      return { a, score: score / Math.sqrt(title.size + 1) };
    })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 5)
    .map((r) => r.a);
}

async function search(backend: OneBackend, platform: string, query: string): Promise<CatalogAction[]> {
  // Same endpoint the CLI and MCP use.
  try {
    const qs = new URLSearchParams({ query, limit: "5", executeAgent: "true" });
    const r = await backend.request(`/available-actions/search/${encodeURIComponent(platform)}?${qs}`);
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) {
        return rows.map((x: any) => ({ _id: String(x.systemId ?? x._id), title: String(x.title), method: String(x.method), path: String(x.path) }));
      }
    }
  } catch {}
  return rank(await catalog(backend, platform), query);
}

// ------------------------------------------------------------------ helpers

function shrink(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 1500 ? `${value.slice(0, 1500)}…` : value;
  if (Array.isArray(value)) {
    const items = value.slice(0, 25).map((v) => shrink(v, depth + 1));
    return value.length > 25 ? [...items, `…${value.length - 25} more`] : items;
  }
  if (value && typeof value === "object") {
    if (depth > 7) return "{…}";
    return Object.fromEntries(Object.entries(value).slice(0, 60).map(([k, v]) => [k, shrink(v, depth + 1)]));
  }
  return value;
}

/** Keeps a provider payload inside a sane token budget for the model. */
function capJson(value: unknown) {
  const text = JSON.stringify(shrink(value));
  if (text === undefined) return null;
  return text.length > 24_000 ? { truncated: true, partial: text.slice(0, 24_000) } : JSON.parse(text);
}

/** Drops response samples from the docs: the model needs inputs, not example outputs. */
function trimKnowledge(md: string) {
  const cut = md.search(/\n#{1,3}\s*(Sample Response|Example Response|Response Example|Success Response)/i);
  const text = cut > 0 ? md.slice(0, cut) : md;
  return text.length > 14_000 ? `${text.slice(0, 14_000)}\n…(truncated)` : text;
}

const PLACEHOLDER = /\{\{?\s*([\w.-]+)\s*\}?\}/g;

function stringQuery(q: Record<string, unknown> | undefined) {
  if (!q) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : Array.isArray(v) ? v.map(String).join(",") : typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

// ------------------------------------------------------------------ describe

/** Resolves what an execute call would do, so the UI can decide whether to ask. */
export async function describeExecute(input: Record<string, any>, backend: OneBackend, connections: Connection[]): Promise<PendingWrite | null> {
  const connection = connections.find((c) => c.key === input.connection_key);
  const k = await backend.getKnowledge(String(input.action_id ?? ""));
  if (!connection || !k) return null;
  return { platform: connection.platform, connectionTitle: connection.title, actionId: k._id, actionTitle: k.title, method: k.method.toUpperCase(), path: k.path };
}

// ------------------------------------------------------------------ run

export async function runOneTool(name: string, input: Record<string, any>, backend: OneBackend): Promise<ToolOutcome> {
  const started = Date.now();
  const done = (content: unknown, receipt: Omit<Receipt, "ms">, isError = false): ToolOutcome => ({
    content,
    receipt: { ...receipt, ms: Date.now() - started },
    isError,
  });

  if (name === "list_one_integrations") {
    const connections = await backend.listConnections();
    return done(
      {
        connections: connections.map((c) => ({ platform: c.platform, key: c.key, title: c.title, access: c.access })),
        summary: { connectedCount: connections.length },
        ...(connections.length ? {} : { note: "Nothing is connected. Ask the user to click Connect your apps." }),
      },
      { tool: "list_one_integrations", ok: true, actionTitle: "List connected apps" },
    );
  }

  if (name === "search_one_platform_actions") {
    const platform = String(input.platform ?? "");
    const query = String(input.query ?? "");
    const connections = await backend.listConnections();
    const connection = connections.find((c) => c.platform === platform);
    if (!connection) {
      return done({ error: `${platform} is not connected. Connected: ${connections.map((c) => c.platform).join(", ") || "none"}.` }, { tool: "search_one_platform_actions", platform, ok: false, actionTitle: `Search ${platform}` }, true);
    }
    const found = (await search(backend, platform, query)).filter((a) => allowedBy(connection.access, a));
    return done(
      found.length
        ? { actions: found.map((a) => ({ actionId: a._id, title: a.title, method: a.method, path: a.path })), next: "Call get_one_action_knowledge with an actionId before executing." }
        : { actions: [], suggestions: "No actions matched inside the grant. Try a more general query ('list', 'search', 'create', 'send')." },
      { tool: "search_one_platform_actions", platform, ok: true, actionTitle: `Search ${platform}: "${query}"` },
    );
  }

  if (name === "get_one_action_knowledge") {
    const k = await backend.getKnowledge(String(input.action_id ?? ""));
    if (!k) return done({ error: "Unknown action id. Use search_one_platform_actions first." }, { tool: "get_one_action_knowledge", ok: false, actionTitle: "Read action docs" }, true);
    const custom = k.tags.includes("custom");
    return done(
      {
        title: k.title,
        method: k.method,
        path: k.path,
        knowledge: trimKnowledge(k.knowledge),
        guidance: [
          "Pass path placeholders in path_variables, query parameters in query_params, and the JSON body in data.",
          "Do not put the connection key in data; execute_one_action adds it where the action needs it.",
          custom ? "This is a One helper action: send the documented fields in data exactly as listed." : null,
        ].filter(Boolean),
      },
      { tool: "get_one_action_knowledge", platform: k.platform, actionId: k._id, actionTitle: k.title, method: k.method, path: k.path, ok: true },
    );
  }

  if (name === "execute_one_action") {
    const connections = await backend.listConnections();
    const connection = connections.find((c) => c.key === input.connection_key);
    const k = await backend.getKnowledge(String(input.action_id ?? ""));
    const base = { tool: "execute_one_action" as const, platform: connection?.platform, actionId: k?._id, actionTitle: k?.title, method: k?.method, path: k?.path };
    if (!connection) return done({ error: "Unknown connection_key. Use a key from list_one_integrations." }, { ...base, ok: false }, true);
    if (!k) return done({ error: "Unknown action id. Use search_one_platform_actions first." }, { ...base, ok: false }, true);

    // "me" is the conventional self id (Gmail, Microsoft Graph); models often omit it.
    const vars: Record<string, unknown> = { userId: "me", ...(input.path_variables ?? {}) };
    const missing = [...k.path.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((key) => vars[key] === undefined || vars[key] === "");
    if (missing.length) return done({ error: `Missing path_variables: ${missing.join(", ")}. Read get_one_action_knowledge, then call again.` }, { ...base, ok: false }, true);
    const path = k.path.replace(PLACEHOLDER, (_, key) => encodeURIComponent(String(vars[key])));

    const method = k.method.toUpperCase();
    let data = input.data && typeof input.data === "object" && Object.keys(input.data).length ? input.data : undefined;
    // One's helper actions (tag "custom") read the connection from the body, as the CLI does.
    if (k.tags.includes("custom") && method !== "GET") data = { ...(data ?? {}), connectionKey: connection.key };

    const result = await backend.runAction({ connectionKey: connection.key, actionId: k._id, method, path, query: stringQuery(input.query_params), body: data });
    const blocked = result.blockedByGrant || (result.status === 403 && !allowedBy(connection.access, { _id: k._id, method }));
    const content = blocked
      ? { error: "blocked_by_grant", message: `The user's One grant does not allow ${method} ${k.title} on ${connection.platform}. The request never reached ${connection.platform}. Do not retry; tell the user.` }
      : result.ok
        ? { status: result.status, data: capJson(result.data) }
        : { error: `HTTP ${result.status}`, detail: capJson(result.data) };
    return done(content, { ...base, method, path, ok: result.ok && !blocked, status: result.status, blockedByGrant: blocked }, !result.ok || blocked);
  }

  return done({ error: `Unknown tool ${name}` }, { tool: name as ToolName, ok: false }, true);
}
