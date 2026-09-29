"use client";

import { Plus, Settings, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { Session } from "@/lib/db";
import type { Profile } from "@/lib/agent-types";
import { logo, platformName } from "@/lib/platforms";
import type { Status } from "./sales-agent";

function groupOf(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ts >= start) return "Today";
  if (ts >= start - 86_400_000) return "Yesterday";
  if (ts >= start - 6 * 86_400_000) return "This week";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function Sidebar(props: {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  profile: Profile;
  status: Status | null;
}) {
  const groups: { label: string; rows: Session[] }[] = [];
  for (const s of props.sessions) {
    const label = groupOf(s.updatedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.rows.push(s);
    else groups.push({ label, rows: [s] });
  }
  const user = props.status?.user;
  const name = props.profile.name || user?.name;
  const initials = (name ?? "You")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="hidden w-[264px] shrink-0 flex-col border-r border-line bg-sunken/60 md:flex">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="grid size-7 place-items-center rounded-lg bg-ink text-[13px] font-semibold text-lime">1</div>
        <div className="leading-tight">
          <div className="font-serif text-[16px] font-medium">Sales Agent</div>
          <div className="text-[11.5px] text-muted">Built on One</div>
        </div>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={props.onNew}
          className="flex w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-[13.5px] font-medium text-ink shadow-card transition hover:border-line-strong"
        >
          <Plus className="size-4" strokeWidth={2} />
          New conversation
        </button>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((g) => (
          <div key={g.label} className="mt-3">
            <div className="micro px-2.5 pb-1">{g.label}</div>
            {g.rows.map((s) => (
              <div
                key={s.id}
                className={clsx(
                  "group flex items-center rounded-lg pr-1 transition-colors",
                  s.id === props.activeId ? "bg-card shadow-card" : "hover:bg-card/70",
                )}
              >
                <button onClick={() => props.onSelect(s.id)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-[13.5px] text-ink-2">
                  {s.title}
                </button>
                <button
                  onClick={() => props.onDelete(s.id)}
                  aria-label="Delete conversation"
                  className="rounded-md p-1.5 text-faint opacity-0 transition hover:bg-sunken hover:text-bad group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        {props.status?.connections?.length ? (
          <div className="mb-3 flex items-center gap-1.5 px-1">
            {props.status.connections.map((c) => (
              <span key={c.platform} title={`${platformName(c.platform)} connected`} className="grid size-7 place-items-center rounded-lg border border-line bg-card">
                <img src={logo(c.platform)} alt="" className="size-4" />
              </span>
            ))}
            <span className="ml-1 text-[12px] text-muted">connected</span>
          </div>
        ) : null}
        {props.status?.mode === "connect" && props.status.connected && !user && (
          <a href="/api/one/authorize" className="mb-2 block rounded-lg px-1.5 py-1 text-[11.5px] leading-snug text-muted transition hover:text-ink">
            Reconnect once to show your One profile here
          </a>
        )}
        <button onClick={props.onSettings} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-card">
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="size-8 rounded-full border border-line object-cover" />
          ) : (
            <span className="grid size-8 place-items-center rounded-full border border-line bg-card text-[12px] font-medium text-ink-2">{initials}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{name || "Set up your profile"}</span>
            <span className="block truncate text-[11.5px] text-muted">{user?.email || props.profile.company || "Name, company, what you sell"}</span>
          </span>
          <Settings className="size-4 text-faint" />
        </button>
      </div>
    </aside>
  );
}
