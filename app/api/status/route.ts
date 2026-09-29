import { inSessionRoute } from "@/lib/session-next";
import { demoMode, one } from "@/lib/one";
import { DEMO_STATUS } from "@/lib/demo";

export const dynamic = "force-dynamic";

// What the header and the Connect card need: which mode, what is connected.
export async function GET(request: Request) {
  if (demoMode) return Response.json(DEMO_STATUS);
  return inSessionRoute(request, async () => {
    const backend = one();
    try {
      const [connections, user] = await Promise.all([backend.listConnections(), backend.getUser().catch(() => null)]);
      return Response.json({
        mode: backend.mode,
        connected: connections.length > 0,
        user,
        connections: connections.map((c) => ({ platform: c.platform, title: c.title, access: c.access.policy === "methods" ? c.access.methods : c.access.policy })),
        ai: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      });
    } catch (err) {
      return Response.json({ mode: backend.mode, connected: false, connections: [], error: err instanceof Error ? err.message : String(err) });
    }
  });
}
