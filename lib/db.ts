"use client";
import Dexie, { type EntityTable } from "dexie";
import type { AgentEvent, Approval, Decision, Pending, PlanStep, Profile } from "./agent-types";

/**
 * Everything the rep sees lives in this browser's IndexedDB, for now:
 * sessions (the API history plus what the UI renders), and the rep's
 * profile. Nothing about a conversation is stored on the server.
 */

export type ToolChip = { id: string; name: string; input: unknown; ok?: boolean; receipt?: Extract<AgentEvent, { type: "tool_result" }>["receipt"] };

export type Item =
  | { kind: "user"; id: string; text: string; at: number }
  | { kind: "assistant"; id: string; text: string; tools: ToolChip[]; progress?: string; at: number; streaming?: boolean }
  | { kind: "approval"; id: string; approvals: Approval[]; decisions?: Record<string, Decision>; at: number }
  | { kind: "error"; id: string; text: string; at: number };

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** The exact Anthropic message history, append-only. */
  history: any[];
  items: Item[];
  plan: PlanStep[];
  pending?: Pending | null;
};

export type Setting = { key: string; value: unknown };

export const db = new Dexie("one-sales-agent") as Dexie & {
  sessions: EntityTable<Session, "id">;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  sessions: "id, updatedAt",
  settings: "key",
});

export async function getProfile(): Promise<Profile> {
  const row = await db.settings.get("profile");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { timeZone: tz, ...((row?.value as Profile) ?? {}) };
}

export async function saveProfile(profile: Profile) {
  await db.settings.put({ key: "profile", value: profile });
}

export function newSession(): Session {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: "New conversation", createdAt: now, updatedAt: now, history: [], items: [], plan: [], pending: null };
}
