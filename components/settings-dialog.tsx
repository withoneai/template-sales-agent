"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Profile } from "@/lib/agent-types";
import { saveProfile } from "@/lib/db";

const FIELDS: { key: keyof Profile; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "name", label: "Your name", placeholder: "Alex Rivera" },
  { key: "company", label: "Company", placeholder: "Acme Robotics" },
  { key: "offer", label: "What you sell", placeholder: "Warehouse picking robots for mid-size 3PLs, $40k-$250k deals", multiline: true },
  { key: "tone", label: "How your emails should sound", placeholder: "Warm, brief, no jargon. Sign off with just my first name." },
  { key: "timeZone", label: "Time zone", placeholder: "America/New_York" },
];

export function SettingsDialog({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (p: Profile) => void }) {
  const [form, setForm] = useState<Profile>(profile);
  const input = "w-full rounded-lg border border-line bg-card px-3 py-2 text-[14px] outline-none transition placeholder:text-faint focus:border-ink/30 focus:ring-3 focus:ring-ink/5";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/20 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="rise w-full max-w-[480px] rounded-2xl border border-line bg-card shadow-lift" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-serif text-[20px] font-medium">Your profile</h2>
            <p className="text-[12.5px] text-muted">The agent uses this to write like you. Saved in this browser only.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-sunken" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3.5 px-5 py-4">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-2">{f.label}</span>
              {f.multiline ? (
                <textarea className={`${input} min-h-[72px] resize-y`} placeholder={f.placeholder} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              ) : (
                <input className={input} placeholder={f.placeholder} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-[13.5px] font-medium text-ink-2 hover:border-line-strong">
            Cancel
          </button>
          <button
            onClick={async () => {
              await saveProfile(form);
              onSave(form);
            }}
            className="rounded-xl bg-ink px-4 py-2 text-[13.5px] font-medium text-white hover:bg-ink-2"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
