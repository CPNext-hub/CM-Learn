// Create real users in the test database and get a login cookie for them.
//
//   const alice = await signUpUser();                 // random email
//   await GET(request("/api/v1/users/me", { cookie: alice.cookie }));
//   const admin = await signUpAdmin();               // role = admin
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { TEST_ADMIN_EMAIL } from "../setup/test-env";
import { request } from "./request";

export const TEST_PASSWORD = "password1234";

export type TestUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  /** Put this in request(..., { cookie }) to act as this user. */
  cookie: string;
};

let counter = 0;

/** Signs up through the real Better Auth route (same path as the website) and returns the session cookie. */
export async function signUpUser(options: { name?: string; email?: string; password?: string } = {}): Promise<TestUser> {
  counter += 1;
  const name = options.name ?? `ผู้ทดสอบ ${counter}`;
  const email = options.email ?? `user-${Date.now()}-${counter}@cmlearn.test`;
  const password = options.password ?? TEST_PASSWORD;

  const res = await authPost(request("/api/auth/sign-up/email", { method: "POST", json: { name, email, password } }));
  if (!res.ok) throw new Error(`signUpUser failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
  return { id: body.user.id, name, email, password, cookie };
}

/** A user whose email is in ADMIN_EMAILS, so Better Auth gives them role "admin". */
export function signUpAdmin() {
  return signUpUser({ name: "ผู้ดูแลทดสอบ", email: TEST_ADMIN_EMAIL });
}
