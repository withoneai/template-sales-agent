import type Anthropic from "@anthropic-ai/sdk";
import type { PendingWrite, Receipt } from "./one-tools-types";

export type Msg = Anthropic.Beta.BetaMessageParam;
export type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

export type Profile = { name?: string; email?: string; company?: string; offer?: string; tone?: string; timeZone?: string };

/** One row of the rep's plan, shown as a checklist beside the chat. */
export type PlanStep = { title: string; status: "pending" | "in_progress" | "done" | "skipped" };

/** A write the model asked for, held until the rep approves it. */
export type Approval = { toolUseId: string; input: Record<string, any>; write: PendingWrite | null };

/** Carried by the browser between the pause and the rep's decision. */
export type Pending = { results: ToolResult[]; approvals: Approval[] };

export type Decision = { approved: boolean; input?: Record<string, any>; note?: string };

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "progress"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; receipt: Receipt; ok: boolean }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "message"; message: Msg }
  | { type: "approval"; pending: Pending }
  | { type: "error"; message: string }
  | { type: "done"; stopReason: string | null };

