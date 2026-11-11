import { requirePageRole } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function DsLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole(["director"], "/ds");
  return children;
}
