import { requirePageRole } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole(["director"], "/director");
  return children;
}
