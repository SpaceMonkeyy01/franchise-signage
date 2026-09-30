// The host's health check (render.yaml). Under /api because /api answers on
// every host: once the console has its own address, `/` on the hosting address
// is a redirect (decision #147), and a check should see the app, not a 307.
// Touches nothing — a slow database should not get the service restarted.

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ ok: true });
}
