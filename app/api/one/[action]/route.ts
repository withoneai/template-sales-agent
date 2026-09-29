import { createOneConnectRoutes } from "@withone/connect/next";
import { connectConfigured, oneConnect } from "@/lib/one";
import { inSessionRoute, requestSession } from "@/lib/session-next";

export const dynamic = "force-dynamic";

// GET /api/one/authorize  -> One's hosted page: sign in, pick tools, set access
// GET /api/one/callback   -> exchanges the code, then seals the token pair into
//                            the session cookie on the redirect home.
export async function GET(request: Request) {
  if (!connectConfigured) return new Response("One Connect is not configured.", { status: 404 });
  const { sid } = await requestSession();
  const routes = createOneConnectRoutes(oneConnect(), { identifyUser: () => sid });
  return inSessionRoute(request, () => routes.GET(request));
}
