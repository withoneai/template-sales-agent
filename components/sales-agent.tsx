"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getProfile, newSession, type Item, type Session } from "@/lib/db";
import { chat } from "@/lib/stream";
import type { AgentEvent, Decision, Profile } from "@/lib/agent-types";
import { Sidebar } from "./sidebar";
import { Thread } from "./thread";
import { Composer } from "./composer";
import { SidePanel } from "./side-panel";
import { ConnectCard } from "./connect-card";
import { SettingsDialog } from "./settings-dialog";
import { EmptyState } from "./empty-state";

export type Status = {
  mode: "connect" | "demo";
  connected: boolean;
  connections: { platform: string; title?: string; access: string | string[] }[];
  ai: boolean;
  /** From One's /v1/users/me; null until the grant carries user:profile:read. */
  user?: { name?: string; email?: string; avatar?: string } | null;
  error?: string;
};

const uid = () => crypto.randomUUID();

export function SalesAgent() {
  const sessions = useLiveQuery(() => db.sessions.orderBy("updatedAt").reverse().toArray(), []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // The working copy during a run; React state lags behind the stream.
  const live = useRef<Session | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await (await fetch("/api/status", { cache: "no-store" })).json());
    } catch {
      setStatus({ mode: "connect", connected: false, connections: [], ai: false, error: "Could not reach the server." });
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    getProfile().then(setProfile);
  }, [refreshStatus]);

  // Open the newest session on first load, or start one.
  useEffect(() => {
    if (!sessions || activeId) return;
    if (sessions.length) setActiveId(sessions[0].id);
    else {
      const s = newSession();
      db.sessions.put(s).then(() => setActiveId(s.id));
    }
  }, [sessions, activeId]);

  useEffect(() => {
    if (!activeId) return;
    if (live.current?.id === activeId) return;
    db.sessions.get(activeId).then((s) => {
      if (s) {
        live.current = s;
        setSession(s);
      }
    });
  }, [activeId]);

  const commit = useCallback(async (s: Session, persist = true) => {
    const next = { ...s, updatedAt: Date.now() };
    live.current = next;
    setSession(next);
    if (persist) await db.sessions.put(next);
  }, []);

  /** Streams one request and folds its events into the session. */
  const run = useCallback(
    async (base: Session, body: Parameters<typeof chat>[0]) => {
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const assistantId = uid();
      let s: Session = { ...base, items: [...base.items, { kind: "assistant", id: assistantId, text: "", tools: [], at: Date.now(), streaming: true }] };
      let newSegment = false;
      let lastPaint = 0;
      await commit(s, false);

      const edit = (fn: (a: Extract<Item, { kind: "assistant" }>) => Extract<Item, { kind: "assistant" }>) => {
        s = { ...s, items: s.items.map((it) => (it.id === assistantId && it.kind === "assistant" ? fn(it) : it)) };
      };

      const apply = (e: AgentEvent) => {
        switch (e.type) {
          case "text":
            edit((a) => ({ ...a, text: a.text + (newSegment && a.text ? "\n\n" : "") + e.delta, progress: undefined }));
            newSegment = false;
            break;
          case "progress":
            edit((a) => ({ ...a, progress: e.text.trim().split("\n").pop() }));
            break;
          case "tool_call":
            edit((a) => ({ ...a, tools: [...a.tools, { id: e.id, name: e.name, input: e.input }] }));
            break;
          case "tool_result":
            edit((a) => ({ ...a, tools: a.tools.map((t) => (t.id === e.id ? { ...t, ok: e.ok, receipt: e.receipt } : t)) }));
            // A result after the card was answered lands on the approval's item too.
            s = { ...s, items: s.items.map((it) => (it.kind === "assistant" && it.id !== assistantId ? { ...it, tools: it.tools.map((t) => (t.id === e.id ? { ...t, ok: e.ok, receipt: e.receipt } : t)) } : it)) };
            break;
          case "plan":
            s = { ...s, plan: e.steps };
            break;
          case "message":
            s = { ...s, history: [...s.history, e.message] };
            if (e.message.role === "assistant") newSegment = true;
            break;
          case "approval":
            s = { ...s, pending: e.pending, items: [...s.items, { kind: "approval", id: uid(), approvals: e.pending.approvals, at: Date.now() }] };
            break;
          case "error":
            s = { ...s, items: [...s.items, { kind: "error", id: uid(), text: e.message, at: Date.now() }] };
            break;
          case "done":
            edit((a) => ({ ...a, streaming: false, progress: undefined }));
            break;
        }
      };

      try {
        for await (const e of chat(body, controller.signal)) {
          apply(e);
          const now = performance.now();
          if (e.type !== "text" || now - lastPaint > 40) {
            lastPaint = now;
            await commit(s, e.type === "message" || e.type === "approval" || e.type === "done");
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") apply({ type: "error", message: (err as Error).message });
      } finally {
        edit((a) => ({ ...a, streaming: false, progress: undefined }));
        // Drop an assistant bubble that never said or did anything.
        s = { ...s, items: s.items.filter((it) => !(it.id === assistantId && it.kind === "assistant" && !it.text && !it.tools.length)) };
        await commit(s);
        setBusy(false);
        abortRef.current = null;
      }
    },
    [commit],
  );

  const send = useCallback(
    async (text: string) => {
      const s = live.current;
      if (!s || busy || !text.trim()) return;
      const userMsg = { role: "user" as const, content: text };
      const next: Session = {
        ...s,
        title: s.history.length ? s.title : text.length > 52 ? `${text.slice(0, 50).trim()}…` : text,
        history: [...s.history, userMsg],
        items: [...s.items, { kind: "user", id: uid(), text, at: Date.now() }],
        pending: null,
      };
      await commit(next);
      await run(next, { messages: next.history, profile });
    },
    [busy, commit, run, profile],
  );

  const decide = useCallback(
    async (itemId: string, decisions: Record<string, Decision>) => {
      const s = live.current;
      if (!s?.pending || busy) return;
      const next: Session = {
        ...s,
        items: s.items.map((it) => (it.id === itemId && it.kind === "approval" ? { ...it, decisions } : it)),
        pending: null,
      };
      await commit(next);
      await run(next, { messages: next.history, profile, pending: s.pending, decisions });
    },
    [busy, commit, run, profile],
  );

  const stop = () => abortRef.current?.abort();

  const startNew = async () => {
    if (busy) return;
    const current = live.current;
    // Reuse an untouched session instead of stacking empty ones.
    if (current && !current.history.length) return;
    const s = newSession();
    await db.sessions.put(s);
    live.current = s;
    setSession(s);
    setActiveId(s.id);
  };

  const remove = async (id: string) => {
    if (busy && id === activeId) return;
    await db.sessions.delete(id);
    if (id === activeId) {
      live.current = null;
      setSession(null);
      setActiveId(null);
    }
  };

  const disconnect = async () => {
    await fetch("/api/one-disconnect", { method: "POST" });
    refreshStatus();
  };

  const empty = !session?.items.length;
  const needsConnect = status && !status.connected;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {status?.mode === "demo" && (
        <div className="banner">
          Demo mode: sample data, nothing leaves this machine. Add <code>ONE_CLIENT_ID</code>, <code>ONE_CLIENT_SECRET</code> and <code>ANTHROPIC_API_KEY</code> to <code>.env</code> to run it on your own CRM and inbox.{" "}
          <a href="https://www.withone.ai/docs" target="_blank" rel="noreferrer">
            Setup guide
          </a>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <Sidebar
        sessions={sessions ?? []}
        activeId={activeId}
        onSelect={(id) => !busy && setActiveId(id)}
        onNew={startNew}
        onDelete={remove}
        onSettings={() => setSettingsOpen(true)}
        profile={profile}
        status={status}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-paper/80 px-6 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-medium text-ink">{session?.title ?? "New conversation"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="rounded-lg px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              {panelOpen ? "Hide plan" : "Show plan"}
            </button>
          </div>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-6 pb-10 pt-8">
            {needsConnect && <ConnectCard status={status} onConnected={refreshStatus} />}
            {status && !status.ai && (
              <div className="mb-6 rounded-xl border border-warn/20 bg-warn-soft px-4 py-3 text-[13.5px] text-warn">
                Add <code className="font-mono">ANTHROPIC_API_KEY</code> to <code className="font-mono">.env</code> and restart to wake the agent up.
              </div>
            )}
            {empty && !needsConnect ? (
              <EmptyState profile={profile} status={status} onPick={setDraft} />
            ) : (
              session && <Thread items={session.items} busy={busy} onDecide={decide} pendingOpen={Boolean(session.pending)} />
            )}
          </div>
        </div>

        <div className="shrink-0 px-6 pb-5">
          <div className="mx-auto w-full max-w-[760px]">
            <Composer
              busy={busy}
              disabled={Boolean(needsConnect) || Boolean(session?.pending)}
              placeholder={session?.pending ? "Approve or decline the action above to continue" : needsConnect ? "Connect your apps to start" : "Ask your sales agent…"}
              text={draft}
              setText={setDraft}
              onSend={send}
              onStop={stop}
            />
          </div>
        </div>
      </main>

      {panelOpen && <SidePanel session={session} status={status} onDisconnect={disconnect} onConnected={refreshStatus} />}
      </div>

      {settingsOpen && (
        <SettingsDialog
          profile={profile}
          onClose={() => setSettingsOpen(false)}
          onSave={(p) => {
            setProfile(p);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
