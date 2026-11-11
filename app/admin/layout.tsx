import { requirePageRole } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole(["admin", "director"], "/admin");
  return children;
}
