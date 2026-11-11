import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Écran camp de base — Last Loop",
  description: "Affichage grand écran du suivi en direct de la course.",
  robots: { index: false, follow: false },
};

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
