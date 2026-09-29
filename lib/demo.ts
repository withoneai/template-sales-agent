import "server-only";
import type { AgentEvent, Decision, Pending, PlanStep } from "./agent-types";
import type { Receipt } from "./one-tools-types";

/**
 * Demo mode: no Connect app and no model key, so the UI runs a scripted
 * replay of a real session on sample data. Same events, same pacing shape,
 * nothing leaves the machine. Configure ONE_CLIENT_ID / ONE_CLIENT_SECRET
 * and ANTHROPIC_API_KEY to run the real agent.
 */

export const DEMO_STATUS = {
  mode: "demo" as const,
  connected: true,
  user: { name: "Alex Rivera", email: "alex@acme.example" },
  connections: [
    { platform: "attio", title: "Attio", access: ["GET", "POST", "PUT", "PATCH"] },
    { platform: "gmail", title: "Gmail", access: ["GET", "POST"] },
  ],
  ai: true,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const id = () => `demo_${Math.random().toString(36).slice(2, 10)}`;

type Emit = (e: AgentEvent) => void;

async function streamText(emit: Emit, text: string) {
  // Word-sized chunks, the way the model streams.
  for (const piece of text.match(/\S+\s*/g) ?? []) {
    emit({ type: "text", delta: piece });
    await sleep(18);
  }
}

async function call(emit: Emit, name: string, input: unknown, receipt: Omit<Receipt, "ms">, ms: number) {
  const callId = id();
  emit({ type: "tool_call", id: callId, name, input });
  await sleep(ms);
  emit({ type: "tool_result", id: callId, ok: receipt.ok, receipt: { ...receipt, ms } });
}

const plan = (emit: Emit, steps: [string, PlanStep["status"]][]) => {
  emit({ type: "tool_call", id: id(), name: "update_plan", input: {} });
  emit({ type: "plan", steps: steps.map(([title, status]) => ({ title, status })) });
};

const DRAFT = {
  to: ["dana.ruiz@northwind.example"],
  subject: "Re: Pilot timeline",
  body: "Hi Dana,\n\nYou asked about the pilot timeline. We can start the two-site pilot on October 13 and have your first pick-rate numbers by the end of that month.\n\nIf that works, I'll send the order form this week. Does Thursday suit you for a 20-minute call to lock the start date?\n\nBest,\nAlex",
};

async function followUp(emit: Emit) {
  emit({ type: "progress", text: "Planning the follow-up" });
  await sleep(700);
  plan(emit, [
    ["Check connected apps", "in_progress"],
    ["Find quiet deals in Attio", "pending"],
    ["Read the latest thread on each", "pending"],
    ["Draft follow-ups in Gmail", "pending"],
  ]);
  await call(emit, "list_one_integrations", {}, { tool: "list_one_integrations", ok: true, actionTitle: "List connected apps" }, 420);
  plan(emit, [
    ["Check connected apps", "done"],
    ["Find quiet deals in Attio", "in_progress"],
    ["Read the latest thread on each", "in_progress"],
    ["Draft follow-ups in Gmail", "pending"],
  ]);
  await Promise.all([
    call(emit, "search_one_platform_actions", { platform: "attio", query: "search records" }, { tool: "search_one_platform_actions", platform: "attio", ok: true, actionTitle: 'Search attio: "search records"' }, 520),
    call(emit, "search_one_platform_actions", { platform: "gmail", query: "list threads" }, { tool: "search_one_platform_actions", platform: "gmail", ok: true, actionTitle: 'Search gmail: "list threads"' }, 610),
  ]);
  await Promise.all([
    call(emit, "get_one_action_knowledge", { platform: "attio" }, { tool: "get_one_action_knowledge", platform: "attio", ok: true, actionTitle: "Search Records Across Objects", method: "POST", path: "/objects/records/search" }, 380),
    call(emit, "get_one_action_knowledge", { platform: "gmail" }, { tool: "get_one_action_knowledge", platform: "gmail", ok: true, actionTitle: "List and View Email Threads", method: "POST", path: "/v1/gmail/get-threads" }, 450),
  ]);
  await Promise.all([
    call(emit, "execute_one_action", { summary: "Find quiet deals" }, { tool: "execute_one_action", platform: "attio", ok: true, status: 200, actionTitle: "List an Object’s Records", method: "POST", path: "/objects/deals/records/query" }, 690),
    call(emit, "execute_one_action", { summary: "Read the threads" }, { tool: "execute_one_action", platform: "gmail", ok: true, status: 200, actionTitle: "List and View Email Threads", method: "POST", path: "/v1/gmail/get-threads" }, 840),
  ]);
  plan(emit, [
    ["Check connected apps", "done"],
    ["Find quiet deals in Attio", "done"],
    ["Read the latest thread on each", "done"],
    ["Draft follow-ups in Gmail", "in_progress"],
  ]);
  const text =
    "Three open deals have had no activity for two weeks or more:\n\n| Deal | Stage | Value | Quiet for |\n|---|---|---|---|\n| Northwind Logistics | Proposal | $48,000 | 16 days |\n| Harbor & Pine | Demo done | $22,000 | 19 days |\n| Kestrel Foods | Discovery | $15,000 | 14 days |\n\nI started with **Northwind**: it is the largest, and Dana Ruiz asked a direct question (when the pilot can start) that never got an answer. Here is a reply; Harbor & Pine and Kestrel are next.";
  await streamText(emit, text);
  emit({ type: "message", message: { role: "assistant", content: text } });
  const toolUseId = id();
  emit({ type: "tool_call", id: toolUseId, name: "execute_one_action", input: { summary: "Save a follow-up to Dana as a Gmail draft" } });
  emit({
    type: "approval",
    pending: {
      results: [],
      approvals: [
        {
          toolUseId,
          input: { summary: "Save a reply to Dana Ruiz at Northwind as a Gmail draft, threaded under “Pilot timeline”.", data: DRAFT },
          write: { platform: "gmail", connectionTitle: "Gmail", actionId: "demo", actionTitle: "Create Draft", method: "POST", path: "/v1/gmail/create-draft" },
        },
      ],
    },
  });
  emit({ type: "done", stopReason: "awaiting_approval" });
}

async function brief(emit: Emit) {
  emit({ type: "progress", text: "Planning the brief" });
  await sleep(600);
  plan(emit, [
    ["Find Northwind in Attio", "in_progress"],
    ["Read recent email", "pending"],
    ["Write the brief", "pending"],
  ]);
  await Promise.all([
    call(emit, "execute_one_action", { summary: "Find Northwind" }, { tool: "execute_one_action", platform: "attio", ok: true, status: 200, actionTitle: "Search Records Across Objects", method: "POST", path: "/objects/records/search" }, 700),
    call(emit, "execute_one_action", { summary: "Recent email" }, { tool: "execute_one_action", platform: "gmail", ok: true, status: 200, actionTitle: "List and View Email Threads", method: "POST", path: "/v1/gmail/get-threads" }, 900),
  ]);
  plan(emit, [
    ["Find Northwind in Attio", "done"],
    ["Read recent email", "done"],
    ["Write the brief", "in_progress"],
  ]);
  const text = `**Northwind Logistics: call brief**

| | |
|---|---|
| Deal | Proposal, $48,000, close date Oct 31 |
| Champion | Dana Ruiz, VP Operations |
| Last touch | Dana asked about the pilot timeline, 16 days ago |
| Open question | Two-site pilot or one? |

**Talking points**
- Answer the timeline first: pilot can start October 13.
- Confirm who signs; Dana mentioned finance reviews anything over $40k.
- Ask which site has the worst pick rate today, and anchor the pilot there.`;
  await streamText(emit, text);
  emit({ type: "message", message: { role: "assistant", content: text } });
  plan(emit, [
    ["Find Northwind in Attio", "done"],
    ["Read recent email", "done"],
    ["Write the brief", "done"],
  ]);
  emit({ type: "done", stopReason: "end_turn" });
}

async function resume(emit: Emit, pending: Pending, decisions: Record<string, Decision>) {
  const a = pending.approvals[0];
  const d = decisions[a.toolUseId];
  await sleep(500);
  if (d?.approved) {
    emit({ type: "tool_result", id: a.toolUseId, ok: true, receipt: { tool: "execute_one_action", platform: "gmail", ok: true, status: 200, actionTitle: "Create Draft", method: "POST", path: "/v1/gmail/create-draft", ms: 640 } });
    emit({
      type: "plan",
      steps: [
        { title: "Check connected apps", status: "done" },
        { title: "Find quiet deals in Attio", status: "done" },
        { title: "Read the latest thread on each", status: "done" },
        { title: "Draft follow-ups in Gmail", status: "in_progress" },
      ],
    });
    const text = `Saved as a draft in Gmail${d.input ? " with your edits" : ""}, threaded under “Pilot timeline”. It has not been sent.\n\nShall I draft Harbor & Pine and Kestrel Foods next?\n\n*Demo mode: this ran on sample data and nothing was written.*`;
    await streamText(emit, text);
    emit({ type: "message", message: { role: "assistant", content: text } });
  } else {
    emit({ type: "tool_result", id: a.toolUseId, ok: false, receipt: { tool: "execute_one_action", platform: "gmail", ok: false, actionTitle: "Create Draft", method: "POST", path: "/v1/gmail/create-draft", ms: 0 } });
    const text = "Understood, nothing was saved. Tell me what to change and I will redraft it.";
    await streamText(emit, text);
    emit({ type: "message", message: { role: "assistant", content: text } });
  }
  emit({ type: "done", stopReason: "end_turn" });
}

export async function runDemo(opts: { messages: any[]; emit: Emit; pending?: Pending; decisions?: Record<string, Decision> }) {
  if (opts.pending) return resume(opts.emit, opts.pending, opts.decisions ?? {});
  const last = [...opts.messages].reverse().find((m) => m.role === "user");
  const text = typeof last?.content === "string" ? last.content : "";
  return /\b(prep|brief|call with)\b/i.test(text) ? brief(opts.emit) : followUp(opts.emit);
}
