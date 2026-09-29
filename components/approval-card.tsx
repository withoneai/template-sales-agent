"use client";

import { useMemo, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import clsx from "clsx";
import type { Item } from "@/lib/db";
import type { Approval, Decision } from "@/lib/agent-types";
import { logo, platformName } from "@/lib/platforms";

type ApprovalItem = Extract<Item, { kind: "approval" }>;

const asList = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

/** Email-shaped bodies (Gmail's helper, Resend) get a real editor; anything else, the JSON. */
function emailFields(data: Record<string, any> | undefined) {
  if (!data || (data.to === undefined && data.subject === undefined)) return null;
  const bodyKey = "body" in data ? "body" : "text" in data ? "text" : "html" in data ? "html" : "body";
  return { bodyKey };
}

function One({ a, active, decision, onChange }: { a: Approval; active: boolean; decision?: Decision; onChange: (d: Decision) => void }) {
  const data = (a.input.data ?? {}) as Record<string, any>;
  const email = emailFields(data);
  const [to, setTo] = useState(asList(data.to));
  const [cc, setCc] = useState(asList(data.cc));
  const [subject, setSubject] = useState(String(data.subject ?? ""));
  const [body, setBody] = useState(email ? String(data[email.bodyKey] ?? "") : "");
  const [json, setJson] = useState(() => JSON.stringify(a.input.data ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const platform = a.write?.platform;

  const edited = (): Record<string, any> | undefined => {
    if (email) {
      const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
      const next: Record<string, any> = { ...data, to: split(to), subject, [email.bodyKey]: body };
      if (cc.trim() || data.cc) next.cc = split(cc);
      const same = asList(data.to) === to && asList(data.cc) === cc && String(data.subject ?? "") === subject && String(data[email.bodyKey] ?? "") === body;
      return same ? undefined : { data: next };
    }
    try {
      const parsed = JSON.parse(json);
      return JSON.stringify(parsed) === JSON.stringify(a.input.data ?? {}) ? undefined : { data: parsed };
    } catch {
      return undefined;
    }
  };

  const approve = () => {
    if (!email) {
      try {
        JSON.parse(json);
      } catch {
        setJsonError("That is not valid JSON.");
        return;
      }
    }
    onChange({ approved: true, input: edited() });
  };

  const decided = decision !== undefined;
  const input = "w-full rounded-lg border border-line bg-card px-3 py-2 text-[14px] outline-none transition focus:border-ink/30 focus:ring-3 focus:ring-ink/5 disabled:bg-sunken/60 disabled:text-ink-2";

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-card shadow-card">
          {platform ? <img src={logo(platform)} alt="" className="size-5" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-medium leading-snug text-ink">{a.input.summary || a.write?.actionTitle || "Run an action"}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <span>{platformName(platform)}</span>
            <span className="text-faint">·</span>
            <span>{a.write?.actionTitle}</span>
            <span className="rounded bg-sunken px-1.5 py-px font-mono text-[10.5px]">{a.write?.method}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {email ? (
          <>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-muted">To</span>
              <input className={input} value={to} onChange={(e) => setTo(e.target.value)} disabled={!active || decided} />
            </label>
            {(data.cc !== undefined || cc) && (
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-medium text-muted">Cc</span>
                <input className={input} value={cc} onChange={(e) => setCc(e.target.value)} disabled={!active || decided} />
              </label>
            )}
            {data.from && (
              <div className="text-[12px] text-muted">
                From <span className="text-ink-2">{String(data.from)}</span>
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-muted">Subject</span>
              <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!active || decided} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-muted">{email.bodyKey === "html" ? "Body (HTML)" : "Message"}</span>
              <textarea className={clsx(input, "min-h-[180px] resize-y leading-relaxed")} value={body} onChange={(e) => setBody(e.target.value)} disabled={!active || decided} />
            </label>
          </>
        ) : (
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-muted">What will be written</span>
            <textarea
              className={clsx(input, "min-h-[140px] resize-y font-mono text-[12.5px] leading-relaxed")}
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                setJsonError(null);
              }}
              disabled={!active || decided}
              spellCheck={false}
            />
            {jsonError && <span className="mt-1 block text-[12px] text-bad">{jsonError}</span>}
          </label>
        )}
      </div>

      {decided ? (
        <div className={clsx("mt-4 flex items-center gap-1.5 text-[13px] font-medium", decision.approved ? "text-accent" : "text-muted")}>
          {decision.approved ? <Check className="size-4" /> : <X className="size-4" />}
          {decision.approved ? (decision.input ? "Approved with your edits" : "Approved") : "Declined"}
        </div>
      ) : active ? (
        <div className="mt-4 flex items-center gap-2">
          <button onClick={approve} className="rounded-xl bg-ink px-4 py-2 text-[13.5px] font-medium text-white shadow-card transition hover:bg-ink-2">
            Approve and run
          </button>
          <button onClick={() => onChange({ approved: false })} className="rounded-xl border border-line bg-card px-4 py-2 text-[13.5px] font-medium text-ink-2 transition hover:border-line-strong">
            Decline
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ApprovalCard({ item, active, onDecide }: { item: ApprovalItem; active: boolean; onDecide: (d: Record<string, Decision>) => void }) {
  const [draft, setDraft] = useState<Record<string, Decision>>({});
  const final = item.decisions;
  const all = useMemo(() => item.approvals.every((a) => draft[a.toolUseId] !== undefined), [draft, item.approvals]);

  const set = (id: string, d: Decision) => {
    const next = { ...draft, [id]: d };
    setDraft(next);
    // Submit once every write on the card has an answer.
    if (item.approvals.every((a) => next[a.toolUseId] !== undefined)) onDecide(next);
  };

  return (
    <div className={clsx("rise overflow-hidden rounded-2xl border bg-card", active && !final ? "border-ink/15 shadow-lift" : "border-line shadow-card")}>
      <div className={clsx("flex items-center gap-2 border-b border-line px-4 py-2.5 text-[12.5px] text-ink-2", active && !final ? "bg-accent-soft" : "bg-sunken/50")}>
        <ShieldCheck className="size-4 text-accent" />
        <span className="font-medium">{final ? "Your call" : "Needs your approval"}</span>
        <span className="text-muted">Nothing runs until you say so.</span>
      </div>
      <div className="divide-y divide-line">
        {item.approvals.map((a) => (
          <One key={a.toolUseId} a={a} active={active && !final && !all} decision={final?.[a.toolUseId] ?? draft[a.toolUseId]} onChange={(d) => set(a.toolUseId, d)} />
        ))}
      </div>
    </div>
  );
}
