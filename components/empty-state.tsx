"use client";

import { CalendarClock, FileText, Mail, UserPlus } from "lucide-react";
import type { Profile } from "@/lib/agent-types";
import type { Status } from "./sales-agent";

const STARTERS = [
  { icon: CalendarClock, title: "Prep my next call", prompt: "Prep me for a call with [company]. Pull what we have on them in the CRM and our recent emails, then give me a one-page brief with talking points." },
  { icon: Mail, title: "Chase quiet deals", prompt: "Find open deals with no activity in the last two weeks. For the top three, draft a short follow-up email to the main contact." },
  { icon: FileText, title: "Log a call", prompt: "Log notes from my call with [person] at [company]: [what happened]. Add a follow-up task for next Tuesday." },
  { icon: UserPlus, title: "Add a new lead", prompt: "Add [name], [title] at [company] ([email]) as a new lead in the CRM, then draft a first-touch email." },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function EmptyState({ profile, status, onPick }: { profile: Profile; status: Status | null; onPick: (text: string) => void }) {
  const first = (profile.name || status?.user?.name)?.split(/\s+/)[0];
  const crm = status?.connections.filter((c) => c.platform === "attio" || c.platform === "hubspot").map((c) => c.title ?? c.platform);
  const mail = status?.connections.filter((c) => c.platform === "gmail" || c.platform === "resend").map((c) => c.title ?? c.platform);
  return (
    <div className="rise pt-10">
      <h2 className="font-serif text-[34px] font-medium tracking-tight text-ink">
        {greeting()}
        {first ? `, ${first}` : ""}.
      </h2>
      <p className="mt-2 max-w-[520px] text-[15px] leading-relaxed text-muted">
        I work in {crm?.length ? crm.join(" and ") : "your CRM"} and {mail?.length ? mail.join(" and ") : "your inbox"}. Tell me what you need; I plan it, show you the plan, and ask before anything gets sent or saved.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="group rounded-2xl border border-line bg-card p-4 text-left shadow-card transition hover:-translate-y-px hover:border-line-strong hover:shadow-lift"
          >
            <s.icon className="size-[18px] text-ink-2" strokeWidth={1.75} />
            <div className="mt-3 text-[14px] font-medium text-ink">{s.title}</div>
            <div className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{s.prompt}</div>
          </button>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-faint">Pick one to load it into the box, fill in the [brackets], and send.</p>
    </div>
  );
}
