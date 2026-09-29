import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { OneBackend } from "./one";
import { ONE_TOOLS, describeExecute, runOneTool, type PendingWrite, type Receipt } from "./one-tools";
import { isWrite } from "./one-tools-types";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const BETAS = ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"];
const MAX_STEPS = 30;


import type { AgentEvent, Approval, Decision, Pending, PlanStep, Profile, Msg, ToolResult } from "./agent-types";
export type { AgentEvent, Approval, Decision, Pending, PlanStep, Profile };

const PLAN_TOOL = {
  name: "update_plan",
  description:
    "Show the rep your plan as a checklist before you start multi-step work, then call it again as steps move to in_progress, done or skipped. Keep steps short and concrete ('Find Acme in HubSpot', 'Draft follow-up to Dana'). Skip it for a single lookup.",
  input_schema: {
    type: "object" as const,
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "done", "skipped"] },
          },
          required: ["title", "status"],
        },
      },
    },
    required: ["steps"],
  },
};

const SYSTEM = `You are a sales rep's AI teammate. You work inside the rep's own tools through One: their CRM (Attio or HubSpot) and their email (Gmail or Resend). You do real work in those tools, not just advice.

How you reach the tools. You have One's four tools, the same ones One's MCP server and CLI expose:
1. list_one_integrations: call it first in a session to learn which apps are connected, their connection keys, and what access the rep granted.
2. search_one_platform_actions: find the API action you need on a connected platform.
3. get_one_action_knowledge: read the action's docs. Always read them before executing; they carry required fields and platform quirks.
4. execute_one_action: run it. Reads run immediately. Anything that writes (sending email, creating or updating CRM records, notes, tasks) is shown to the rep on an approval card, and runs only if they approve. If they decline, accept it and adjust; never resend the same write.

How you work: plan, then build.
- For anything with more than one step, first call update_plan with a short checklist, then do the work, updating step status as you go.
- Gather facts before writing. Look the person or company up in the CRM, check recent email with them, then draft.
- Batch the reads. When you need several independent lookups, call the tools in parallel.
- Remember action ids and connection keys you have already found in this session instead of searching again.

Sales judgment.
- Emails are short, specific, and sound like a person: one clear ask, no filler, no "I hope this finds you well". Use a fact you actually found (their last reply, a deal stage, a note) and never invent one.
- Never claim you did something you did not do. Say "drafted" for drafts and "sent" only after the send succeeded.
- When the rep asks you to log something (a call, a note, a task), write it to the CRM they use and say where it landed.
- With Gmail, prefer creating a draft unless the rep says send. With Resend, you can only send, and a verified from-address is required; ask for it if you do not know it.
- If both CRMs are connected and the rep has not said which, ask once and then stick with it for the session.
- If a call is blocked by the grant, say which access is missing so the rep can widen it in One. Do not retry.

Style. Lead with the answer. Plain words, short paragraphs, bullets for lists, tables for records. No em dashes. When you reference a CRM record or email, include the name and the one detail that matters.`;

function systemBlocks(profile: Profile): Anthropic.Beta.BetaTextBlockParam[] {
  const tz = profile.timeZone || "America/New_York";
  const now = new Date().toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short" });
  const about = [
    profile.name && `Rep: ${profile.name}`,
    profile.email && `Signed in to One as: ${profile.email}. Sign emails as this person; this is not a recipient.`,
    profile.company && `Company: ${profile.company}`,
    profile.offer && `What they sell: ${profile.offer}`,
    profile.tone && `Preferred email tone: ${profile.tone}`,
    `Time zone: ${tz}. Now: ${now}.`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: `About the rep:\n${about}` },
  ];
}

export function needsApproval(write: PendingWrite | null) {
  return Boolean(write && isWrite(write.method, write.path));
}

function resultBlock(id: string, content: unknown, isError?: boolean): ToolResult {
  return { type: "tool_result", tool_use_id: id, content: JSON.stringify(content), ...(isError ? { is_error: true } : {}) };
}

/**
 * Runs the agent until it ends its turn or asks to write. Streams events;
 * every message it adds to the history goes out as a `message` event so the
 * browser can store it (append-only, which preserved thinking requires).
 */
export async function runAgent(opts: {
  messages: Msg[];
  profile: Profile;
  backend: OneBackend;
  emit: (e: AgentEvent) => void;
  resume?: { pending: Pending; decisions: Record<string, Decision> };
  signal?: AbortSignal;
}) {
  const { backend, emit, profile } = opts;
  const messages = [...opts.messages];
  const client = new Anthropic();
  const connections = () => backend.listConnections();

  const push = (m: Msg) => {
    messages.push(m);
    emit({ type: "message", message: m });
  };

  // The rep answered an approval card: run what they approved, then carry on.
  if (opts.resume) {
    const results = [...opts.resume.pending.results];
    for (const a of opts.resume.pending.approvals) {
      const d = opts.resume.decisions[a.toolUseId];
      if (!d?.approved) {
        const why = d?.note ? ` Their note: "${d.note}"` : "";
        results.push(resultBlock(a.toolUseId, { declined: true, message: `The rep declined this action. It did not run.${why}` }, true));
        emit({ type: "tool_result", id: a.toolUseId, ok: false, receipt: { tool: "execute_one_action", ...(a.write ?? {}), ok: false, ms: 0 } });
        continue;
      }
      const input = d.input ? { ...a.input, ...d.input } : a.input;
      const out = await runOneTool("execute_one_action", input, backend);
      const edited = d.input ? { note: "The rep edited the fields before approving. It ran with the edited values.", ran_with: d.input } : {};
      results.push(resultBlock(a.toolUseId, { ...edited, ...(out.content as object) }, out.isError));
      emit({ type: "tool_result", id: a.toolUseId, ok: out.receipt.ok, receipt: out.receipt });
    }
    push({ role: "user", content: results });
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    if (opts.signal?.aborted) return;
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 32_000,
        betas: BETAS,
        fallbacks: "default",
        thinking: { type: "adaptive", display: "updates" },
        output_config: { effort: "medium" },
        system: systemBlocks(profile),
        tools: [...ONE_TOOLS, PLAN_TOOL],
        messages,
      },
      { signal: opts.signal },
    );
    stream.on("text", (delta) => emit({ type: "text", delta }));
    stream.on("thinking", (delta) => delta.trim() && emit({ type: "progress", text: delta }));

    const message = await stream.finalMessage();
    push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });

    if (message.stop_reason === "refusal") {
      emit({ type: "error", message: "The model declined this request." });
      emit({ type: "done", stopReason: "refusal" });
      return;
    }
    if (message.stop_reason !== "tool_use") {
      emit({ type: "done", stopReason: message.stop_reason });
      return;
    }

    const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const conns = await connections();
    const results: ToolResult[] = [];
    const approvals: Approval[] = [];

    // Sort writes out first, then run every read in parallel.
    const reads: Anthropic.Beta.BetaToolUseBlock[] = [];
    for (const call of calls) {
      emit({ type: "tool_call", id: call.id, name: call.name, input: call.input });
      if (call.name === "execute_one_action") {
        const write = await describeExecute(call.input as Record<string, any>, backend, conns);
        if (needsApproval(write)) {
          approvals.push({ toolUseId: call.id, input: call.input as Record<string, any>, write });
          continue;
        }
      }
      reads.push(call);
    }

    const outcomes = await Promise.all(
      reads.map(async (call) => {
        if (call.name === "update_plan") {
          const steps = ((call.input as any)?.steps ?? []) as PlanStep[];
          emit({ type: "plan", steps });
          return { call, block: resultBlock(call.id, { ok: true, shown_to_rep: true }) };
        }
        try {
          const out = await runOneTool(call.name, call.input as Record<string, any>, backend);
          emit({ type: "tool_result", id: call.id, ok: out.receipt.ok, receipt: out.receipt });
          return { call, block: resultBlock(call.id, out.content, out.isError) };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          emit({ type: "tool_result", id: call.id, ok: false, receipt: { tool: call.name as Receipt["tool"], ok: false, ms: 0 } });
          return { call, block: resultBlock(call.id, { error: msg }, true) };
        }
      }),
    );
    // Results go back in the order the model asked for them.
    for (const call of calls) {
      const hit = outcomes.find((o) => o.call.id === call.id);
      if (hit) results.push(hit.block);
    }

    if (approvals.length) {
      emit({ type: "approval", pending: { results, approvals } });
      emit({ type: "done", stopReason: "awaiting_approval" });
      return;
    }
    push({ role: "user", content: results });
  }
  emit({ type: "error", message: `Stopped after ${MAX_STEPS} steps. Ask me to continue.` });
  emit({ type: "done", stopReason: "max_steps" });
}
