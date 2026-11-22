import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Until FE01's public Home page exists: members go to My Sheets, guests to the login page.
export default async function HomePage() {
  const session = await getSession();
  redirect(session ? "/my-sheets" : "/login");
}
