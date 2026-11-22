"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Icon from "@/components/ui/Icon";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const logout = async () => {
    setBusy(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "ออกจากระบบไม่สำเร็จ");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "ออกจากระบบไม่สำเร็จ");
      setBusy(false);
    }
  };
  return <button className="secondary-button" type="button" onClick={logout} disabled={busy} style={{ color: "#c45d67", background: "#fff7f7" }}><Icon name="log-out" size={14} /> {busy ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}</button>;
}
