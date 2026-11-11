import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partager ma position — Last Loop",
  description: "Page de suivi GPS d’un coureur Last Loop.",
  robots: { index: false, follow: false },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
