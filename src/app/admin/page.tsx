import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getSession } from "@/lib/session";

// Admin area: checked on the server — hiding a link in the UI is not access control.
export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/my-sheets");
  return <main className="site-frame"><Navbar /><section className="page-surface" /><Footer /></main>;
}
