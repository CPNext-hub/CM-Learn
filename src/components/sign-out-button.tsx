"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

// Unstyled logout button for FE to place in the Navbar. Pass className to style it.
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function handleClick() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      ออกจากระบบ
    </button>
  );
}
