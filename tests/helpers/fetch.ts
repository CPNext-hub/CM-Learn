// For browser-side code (src/services, src/lib/api-client.ts) that calls fetch():
// replace fetch with a fake that returns the answers you choose, and see which URLs were called.
//
//   const fetchMock = mockFetch({ "/api/v1/subjects": { data: [] } });
//   await loadLookups();
//   expect(fetchMock).toHaveBeenCalledWith("/api/v1/subjects", undefined);
import { afterEach, vi } from "vitest";

export type FakeResponse = unknown | { status: number; body: unknown } | Error;

const isStatusReply = (r: unknown): r is { status: number; body: unknown } =>
  typeof r === "object" && r !== null && "status" in r && "body" in r;

/**
 * routes: URL (or the part before "?") → JSON body, { status, body } for errors, or an Error for a network failure.
 * A URL that is not listed answers 404.
 */
export function mockFetch(routes: Record<string, FakeResponse>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const reply = routes[url] ?? routes[url.split("?")[0]];
    if (reply instanceof Error) throw reply;
    if (reply === undefined) return Response.json({ error: { code: "NOT_FOUND", message: "ไม่พบ" } }, { status: 404 });
    if (isStatusReply(reply)) return Response.json(reply.body, { status: reply.status });
    return Response.json(reply);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Put the real fetch back after every test.
afterEach(() => {
  vi.unstubAllGlobals();
});
