"use client";

import { Check, Circle, LogOut } from "lucide-react";
import clsx from "clsx";
import type { Session, ToolChip } from "@/lib/db";
import { logo, platformName } from "@/lib/platforms";
import { isWrite } from "@/lib/one-tools-types";
import type { Status } from "./sales-agent";

function accessLabel(access: string | string[]) {
  if (access === "full") return "Full access";
  if (Array.isArray(access)) {
    const reads = access.includes("GET");
    const writes = access.some((m) => m !== "GET");
    return reads && writes ? "Read and write" : writes ? "Write only" : "Read only";
  }
  return "Selected actions";
}

export function SidePanel({ session, status, onDisconnect }: { session: Session | null; status: Status | null; onDisconnect: () => void; onConnected: () => void }) {
  const plan = session?.plan ?? [];
  const done = plan.filter((s) => s.status === "done" || s.status === "skipped").length;
  const writes: ToolChip[] = (session?.items ?? []).flatMap((it) => (it.kind === "assistant" ? it.tools.filter((t) => t.name === "execute_one_action" && t.receipt && isWrite(t.receipt.method, t.receipt.path)) : []));

  return (
    <aside className="scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-l border-line bg-card/60 lg:block">
      <section className="border-b border-line p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="micro">Plan</h3>
          {plan.length > 0 && (
            <span className="num text-[11px] text-faint">
              {done} of {plan.length}
            </span>
          )}
        </div>
        {plan.length ? (
          <>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${(done / plan.length) * 100}%` }} />
            </div>
            <ol className="mt-4 space-y-2.5">
              {plan.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug">
                  {s.status === "done" ? (
                    <span className="mt-px grid size-[18px] shrink-0 place-items-center rounded-full bg-ink text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : s.status === "in_progress" ? (
                    <span className="mt-px size-[18px] shrink-0 animate-spin rounded-full border-2 border-ink/15 border-t-ink" />
                  ) : (
                    <Circle className={clsx("mt-px size-[18px] shrink-0", s.status === "skipped" ? "text-line-strong" : "text-faint")} strokeWidth={1.5} />
                  )}
                  <span className={clsx(s.status === "done" && "text-muted", s.status === "skipped" && "text-faint line-through", s.status === "in_progress" && "font-medium text-ink")}>{s.title}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">When you ask for something with a few steps, the plan shows up here and ticks off as the agent works.</p>
        )}
      </section>

      <section className="border-b border-line p-5">
        <h3 className="micro">Changes made</h3>
        {writes.length ? (
          <ul className="mt-3 space-y-2">
            {writes.map((t) => (
              <li key={t.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-card p-2.5 text-[12.5px]">
                {t.receipt?.platform && <img src={logo(t.receipt.platform)} alt="" className="mt-0.5 size-4" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{t.receipt?.actionTitle}</span>
                  <span className={clsx("block", t.ok ? "text-muted" : t.receipt?.blockedByGrant ? "text-warn" : "text-bad")}>
                    {t.ok ? "Done" : t.receipt?.blockedByGrant ? "Blocked by your grant" : `Failed${t.receipt?.status ? ` (${t.receipt.status})` : ""}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">Every email sent and CRM record written in this conversation is listed here.</p>
        )}
      </section>

      <section className="p-5">
        <h3 className="micro">Connected through One</h3>
        <ul className="mt-3 space-y-2">
          {(status?.connections ?? []).map((c) => (
            <li key={c.platform} className="flex items-center gap-2.5 text-[13px]">
              <span className="grid size-7 place-items-center rounded-lg border border-line bg-card">
                <img src={logo(c.platform)} alt="" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{platformName(c.platform)}</span>
                <span className="block text-[11.5px] text-muted">{accessLabel(c.access)}</span>
              </span>
            </li>
          ))}
          {!status?.connections?.length && <li className="text-[13px] text-muted">Nothing connected yet.</li>}
        </ul>
        {status?.mode === "connect" && status.connected && (
          <button onClick={onDisconnect} className="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted transition hover:text-ink">
            <LogOut className="size-3.5" /> Disconnect this browser
          </button>
        )}
        <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
          Your tokens stay sealed in this browser. Change or revoke access any time in your One dashboard under Access control.
        </p>
      </section>
    </aside>
  );
}
