export type ToolName = "list_one_integrations" | "search_one_platform_actions" | "get_one_action_knowledge" | "execute_one_action";

/** What the UI shows for a call: the One action behind it and how it went. */
export type Receipt = {
  tool: ToolName;
  platform?: string;
  actionId?: string;
  actionTitle?: string;
  method?: string;
  path?: string;
  ok: boolean;
  status?: number;
  blockedByGrant?: boolean;
  ms: number;
};

/** A write the user must approve, described from the action's own catalog entry. */
export type PendingWrite = {
  platform: string;
  connectionTitle?: string;
  actionId: string;
  actionTitle: string;
  method: string;
  path: string;
};


/** POSTs that only read: search, query, list and One's get- helpers. */
const READ_POST = /\/(search|query)(\/|$)|\/get-|\/list|\/batch\/read/i;

/** Whether an action changes something, and so needs the rep's approval. */
export function isWrite(method?: string, path?: string) {
  const m = (method ?? "").toUpperCase();
  if (!m || m === "GET" || m === "HEAD") return false;
  if (m === "POST" && READ_POST.test(path ?? "")) return false;
  return true;
}
