// src/lib/auth-client.ts มี 3 บรรทัด (สร้าง client ของ Better Auth) — แค่ import ก็ถูกนับ coverage
import { expect, test } from "vitest";
import { authClient } from "@/lib/auth-client";

test("authClient มีฟังก์ชันที่หน้าเว็บใช้", () => {
  expect(typeof authClient.signIn.email).toBe("function");
  expect(typeof authClient.signOut).toBe("function");
});
