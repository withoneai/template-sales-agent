"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, CircleSlash, X } from "lucide-react";
import clsx from "clsx";
import type { Item, ToolChip } from "@/lib/db";
import type { Decision } from "@/lib/agent-types";
import { logo, platformName } from "@/lib/platforms";
import { Markdown } from "./markdown";
import { ApprovalCard } from "./approval-card";

const TOOL_LABEL: Record<string, string> = {
  list_one_integrations: "Checked connected apps",
  search_one_platform_actions: "Searched actions",
  get_one_action_knowledge: "Read action docs",
  execute_one_action: "Ran action",
  update_plan: "Updated the plan",
};

function chipText(t: ToolChip) {
  const input = (t.input ?? {}) as Record<string, any>;
  if (t.name === "search_one_platform_actions") return `Searched ${platformName(input.platform)} for "${input.query}"`;
  if (t.name === "get_one_action_knowledge") return t.receipt?.actionTitle ? `Read docs: ${t.receipt.actionTitle}` : "Read action docs";
  if (t.name === "execute_one_action") return t.receipt?.actionTitle ?? input.summary ?? "Ran action";
  return TOOL_LABEL[t.name] ?? t.name;
}

function chipPlatform(t: ToolChip) {
  const input = (t.input ?? {}) as Record<string, any>;
  return t.receipt?.platform ?? input.platform;
}

function ToolRow({ t }: { t: ToolChip }) {
  const platform = chipPlatform(t);
  const pending = t.ok === undefined && t.name !== "update_plan";
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-[13px]">
      <span className="grid size-5 shrink-0 place-items-center rounded-md border border-line bg-card">
        {platform ? <img src={logo(platform)} alt="" className="size-3" /> : <span className="text-[9px] font-semibold text-ink">1</span>}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2">{chipText(t)}</span>
      {t.receipt?.method && t.name === "execute_one_action" && (
        <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{t.receipt.method}</span>
      )}
      {t.receipt?.ms ? <span className="num text-[11px] text-faint">{t.receipt.ms}ms</span> : null}
      {pending ? (
        <span className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink" />
      ) : t.receipt?.blockedByGrant ? (
        <span className="flex items-center gap-1 text-[11.5px] text-warn">
          <CircleSlash className="size-3.5" /> blocked by grant
        </span>
      ) : t.ok === false ? (
        <X className="size-3.5 text-bad" />
      ) : (
        <Check className="size-3.5 text-muted" />
      )}
    </div>
  );
}

function ToolGroup({ tools, streaming }: { tools: ToolChip[]; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const visible = tools.filter((t) => t.name !== "update_plan");
  if (!visible.length) return null;
  const running = visible.some((t) => t.ok === undefined);
  const platforms = [...new Set(visible.map(chipPlatform).filter(Boolean))] as string[];
  const expanded = open || (streaming && running);
  return (
    <div className="my-2 rounded-xl border border-line bg-card/70">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-muted">
        <ChevronRight className={clsx("size-3.5 transition-transform", expanded && "rotate-90")} />
        <span className={clsx(running && streaming && "shimmer-text")}>
          {running && streaming ? "Working in your tools" : `Used ${visible.length} ${visible.length === 1 ? "action" : "actions"}`}
        </span>
        <span className="ml-auto flex -space-x-1">
          {platforms.map((p) => (
            <span key={p} className="grid size-5 place-items-center rounded-full border border-line bg-card">
              <img src={logo(p)} alt="" className="size-3" />
            </span>
          ))}
        </span>
      </button>
      {expanded && <div className="border-t border-line px-3 py-1">{visible.map((t) => <ToolRow key={t.id} t={t} />)}</div>}
    </div>
  );
}

function Typing({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[13px] text-muted">
      <span className="flex gap-1">
        <span className="dot size-1.5 rounded-full bg-muted" />
        <span className="dot size-1.5 rounded-full bg-muted" />
        <span className="dot size-1.5 rounded-full bg-muted" />
      </span>
      {label && <span className="shimmer-text truncate">{label}</span>}
    </div>
  );
}

export function Thread({ items, busy, onDecide, pendingOpen }: { items: Item[]; busy: boolean; onDecide: (itemId: string, d: Record<string, Decision>) => void; pendingOpen: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const last = items[items.length - 1];
  const lastLen = last?.kind === "assistant" ? last.text.length + last.tools.length : 0;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, lastLen]);

  return (
    <div className="space-y-7">
      {items.map((it) => {
        if (it.kind === "user")
          return (
            <div key={it.id} className="rise flex justify-end">
              <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-white">{it.text}</div>
            </div>
          );
        if (it.kind === "error")
          return (
            <div key={it.id} className="rise rounded-xl border border-bad/15 bg-bad-soft px-4 py-3 text-[13.5px] text-bad">
              {it.text}
            </div>
          );
        if (it.kind === "approval") {
          const isLatest = it.id === [...items].reverse().find((x) => x.kind === "approval")?.id;
          return <ApprovalCard key={it.id} item={it} active={isLatest && pendingOpen && !busy} onDecide={(d) => onDecide(it.id, d)} />;
        }
        return (
          <div key={it.id} className="rise flex gap-3">
            <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-[12px] font-semibold text-lime">1</div>
            <div className="min-w-0 flex-1">
              <ToolGroup tools={it.tools} streaming={it.streaming} />
              {it.text && <Markdown text={it.text} />}
              {it.streaming && !it.text && <Typing label={it.progress} />}
              {it.streaming && it.text && it.progress && <Typing label={it.progress} />}
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
