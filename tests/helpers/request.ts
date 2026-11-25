// Build Requests and call route handlers directly (no server needed, and the code is counted in coverage).
//
//   import { GET } from "@/app/api/v1/sheets/[id]/route";
//   const res = await GET(request(`/api/v1/sheets/${id}`, { cookie }), params({ id }));
//   expect(res.status).toBe(200);
//   const body = await json(res);
import { TEST_ORIGIN } from "../setup/test-env";

export type RequestOptions = {
  method?: string;
  /** Sent as JSON with Content-Type: application/json */
  json?: unknown;
  /** Sent as multipart/form-data (file uploads) */
  form?: FormData;
  /** Any other body (string, bytes) */
  body?: BodyInit;
  /** Cookie header from signUpUser() — makes the request "logged in" */
  cookie?: string;
  headers?: Record<string, string>;
};

export function request(path: string, options: RequestOptions = {}): Request {
  const { method = "GET", json: jsonBody, form, body, cookie, headers = {} } = options;
  return new Request(new URL(path, TEST_ORIGIN), {
    method,
    headers: {
      Origin: TEST_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(jsonBody !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : (form ?? body),
  });
}

/** Second argument of dynamic routes like sheets/[id]: params(\{ id \}) */
export function params<T extends Record<string, string | string[] | undefined>>(value: T) {
  return { params: Promise.resolve(value) };
}

/** Reads a JSON response body (our API always answers { data } or { error }). */
export async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
