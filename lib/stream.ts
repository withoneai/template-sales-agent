"use client";
import type { AgentEvent, Decision, Pending, Profile } from "./agent-types";

/** Posts a turn and yields the agent's events as they arrive. */
export async function* chat(body: { messages: any[]; profile: Profile; pending?: Pending; decisions?: Record<string, Decision> }, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) {
    let message = `Request failed (${response.status})`;
    try {
      message = (await response.json()).error ?? message;
    } catch {}
    yield { type: "error", message };
    yield { type: "done", stopReason: "error" };
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line) as AgentEvent;
    }
  }
}
