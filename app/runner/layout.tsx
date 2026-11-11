import { requirePageRole } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function RunnerLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole(["runner"], "/runner");
  return children;
}
