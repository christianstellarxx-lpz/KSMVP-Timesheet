import { redirect } from "next/navigation";
import { getSession, homePathForRole } from "@/lib/session";

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? homePathForRole(session.role) : "/login");
}
