"use client";

import { ConnectButton } from "@withone/connect/react";
import { useState } from "react";
import { logo } from "@/lib/platforms";
import type { Status } from "./sales-agent";

const ASKS = [
  { slug: "attio", name: "Attio", why: "or HubSpot, your CRM" },
  { slug: "hubspot", name: "HubSpot", why: "or Attio, your CRM" },
  { slug: "gmail", name: "Gmail", why: "read threads, draft, send" },
  { slug: "resend", name: "Resend", why: "or send from your domain" },
];

export function ConnectCard({ status, onConnected }: { status: Status; onConnected: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rise mb-8 overflow-hidden rounded-3xl border border-line bg-card shadow-lift">
      <div className="p-7">
        <div className="micro !text-accent">One step</div>
        <h2 className="mt-2 font-serif text-[28px] font-medium tracking-tight">Connect your CRM and email</h2>
        <p className="mt-2 max-w-[520px] text-[14.5px] leading-relaxed text-muted">
          Your agent works inside your own tools. Pick a CRM and a way to send email, choose how much access to give, and you can change it any time.
        </p>
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {ASKS.map((a) => (
            <div key={a.slug} className="flex items-center gap-3 rounded-xl border border-line bg-paper/60 px-3.5 py-3">
              <span className="grid size-9 place-items-center rounded-lg border border-line bg-card">
                <img src={logo(a.slug)} alt="" className="size-5" />
              </span>
              <span>
                <span className="block text-[14px] font-medium">{a.name}</span>
                <span className="block text-[12.5px] text-muted">{a.why}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <ConnectButton
            authorizeUrl="/api/one/authorize"
            platforms={["attio", "hubspot", "gmail", "resend"]}
            connected={status.connected}
            size="lg"
            theme="light"
            connectTheme="light"
            onSuccess={onConnected}
            onError={(message) => setError(message)}
          />
          {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
        </div>
      </div>
      <div className="border-t border-line bg-sunken/50 px-7 py-3.5 text-[12.5px] text-muted">
        Secured by One. This app never sees your passwords, and One checks every call against what you granted.
      </div>
    </div>
  );
}
