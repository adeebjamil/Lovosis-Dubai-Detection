import type { Metadata } from "next";
import PanelShell from "@/components/layout/PanelShell";

export const metadata: Metadata = {
  title: {
    template: "%s · Lovosis Detection",
    default: "Lovosis Detection",
  },
};

// Opt out of Next.js 16 Turbopack instant-navigation validation for the authenticated admin shell
export const instant = false;

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
