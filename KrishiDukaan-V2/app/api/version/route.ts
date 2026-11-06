// The build this server instance is running. Polled by UpdatePrompt so tabs
// left open across a deploy learn there is something newer to load.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
