# Sales Agent

An AI sales teammate that works inside your own CRM and inbox. Ask it to prep a call, chase a quiet deal, log a meeting or add a lead: it shows you a plan, looks things up in Attio or HubSpot and Gmail, and drafts the email or the CRM update. Nothing is saved or sent until you approve it.

Built on [One Connect](https://www.withone.ai/products/connect). Your users connect their own tools through One's hosted consent page and choose how much access to give. The app never sees a password or an API key for Attio, HubSpot, Gmail or Resend, and One checks every call against what the user granted.

![Sales Agent](https://www.withone.ai/images/templates/sales-agent.webp)

## What it does

- **Plans first.** For anything with more than one step, the agent posts a checklist that ticks off as it works.
- **Works in your tools.** CRM: Attio or HubSpot. Email: Gmail (read threads, draft, send) or Resend (send from your domain).
- **Asks before it writes.** Every send, draft, note, task or record change stops on an approval card. Emails are editable (To, Subject, Message) before you approve; decline with a note and the agent adjusts.
- **Stays inside the grant.** If the user granted read-only access, a write is refused by One before it reaches the provider, and the agent says which access is missing.
- **Keeps history in the browser.** Conversations live in IndexedDB. The server is stateless.

## Run it

```bash
npm install
npm run dev
```

It starts in **demo mode** on sample data, so you can see the whole flow (plan, lookups, approval card) before connecting anything. Try "Chase quiet deals" or "Prep my next call".

## Connect it for real

1. **Create a Connect app** at [app.withone.ai](https://app.withone.ai) → Developers → Connect → New app.
   - Redirect URI: `http://localhost:3000/api/one/callback` (add your production URL too when you deploy).
   - Ask for Attio, HubSpot, Gmail and Resend, read and write. This gives you a permission set id.
2. **Get a Claude API key** at [console.anthropic.com](https://console.anthropic.com).
3. Copy `.env.example` to `.env` and fill in:

   ```bash
   ONE_CLIENT_ID=...
   ONE_CLIENT_SECRET=one_secret_...
   ONE_PERMISSION_SET=...
   ANTHROPIC_API_KEY=sk-ant-...
   ```

4. `npm run dev`, click **Connect your apps**, and pick your CRM and email.

## How it works

The agent has exactly four tools, the same ones One's [MCP server](https://www.withone.ai/products/mcp) and [CLI](https://www.withone.ai/products/cli) expose:

| Tool | What it does |
|---|---|
| `list_one_integrations` | What the user connected, and the access each grant allows |
| `search_one_platform_actions` | Find the API action for a task on a connected platform |
| `get_one_action_knowledge` | Read that action's docs before calling it |
| `execute_one_action` | Run it through One, with the user's grant enforced |

Nothing in the code is specific to Attio, HubSpot, Gmail or Resend. The sales behaviour is the system prompt in `lib/agent.ts`; the reach is whatever the user granted. Add Slack or Google Calendar to the Connect app and the agent can use them with no code change.

| File | What's in it |
|---|---|
| `lib/agent.ts` | The agent loop (Claude, streaming), the system prompt, the approval pause |
| `lib/one-tools.ts` | The four One tools |
| `lib/session.ts`, `proxy.ts` | The Connect token pair, sealed in an HttpOnly cookie (AES-256-GCM) and refreshed ahead of expiry |
| `app/api/one/[action]/route.ts` | Connect's authorize and callback routes |
| `lib/db.ts` | IndexedDB storage for conversations and the rep's profile |
| `lib/demo.ts` | The scripted demo run |

## Deploy

Any Node host works (Vercel, Railway, Replit). Set the same env vars, and set `ONE_REDIRECT_URI` to `https://<your-domain>/api/one/callback`, registered on the Connect app.

## License

MIT
