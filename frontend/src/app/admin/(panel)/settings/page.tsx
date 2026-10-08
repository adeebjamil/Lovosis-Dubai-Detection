import type { Metadata } from "next";
import { Suspense } from "react";
import SettingsView from "@/components/settings/SettingsView";

export const metadata: Metadata = { title: "Settings" };

// Opt out of Next.js 16 Turbopack instant-navigation validation
export const instant = false;

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
