import { redirect } from "next/navigation";

// The old starter dashboard is replaced by My Sheets (which sends guests to /login itself).
export default function DashboardPage() {
  redirect("/my-sheets");
}
