import { inSessionRoute } from "@/lib/session-next";
import { demoMode, one } from "@/lib/one";
import { runDemo } from "@/lib/demo";
import { runAgent, type AgentEvent, type Decision, type Pending, type Profile } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/chat  -> newline-delimited JSON events (see AgentEvent).
// The browser owns the history (IndexedDB); this route is stateless.
type Body = { messages: any[]; profile?: Profile; pending?: Pending; decisions?: Record<string, Decision> };

function ndjson(run: (emit: (e: AgentEvent) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await run(emit);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A Connect grant the user revoked surfaces here as refresh_failed.
        const friendly = /refresh_failed|not_connected/.test(message) ? "Your One connection expired. Connect your apps again." : message;
        emit({ type: "error", message: friendly });
        emit({ type: "done", stopReason: "error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (demoMode) {
    const body = (await request.json()) as Body;
    return ndjson((emit) => runDemo({ messages: body.messages ?? [], emit, pending: body.pending, decisions: body.decisions }));
  }
  return inSessionRoute(request, async () => {
    const body = (await request.json()) as Body;
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      return Response.json({ error: "ANTHROPIC_API_KEY is not set in .env" }, { status: 500 });
    }
    const backend = one();
    // Who the agent works for, from One (/v1/users/me). The rep's own profile
    // fields win; One fills the name and adds the email they send from.
    const user = await backend.getUser().catch(() => null);
    const profile: Profile = { ...body.profile, name: body.profile?.name || user?.name, email: user?.email };
    return ndjson((emit) =>
      runAgent({
        messages: body.messages ?? [],
        profile,
        backend,
        emit,
        resume: body.pending ? { pending: body.pending, decisions: body.decisions ?? {} } : undefined,
        signal: request.signal,
      }),
    );
  });
}
