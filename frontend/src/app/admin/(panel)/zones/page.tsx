import type { Metadata } from "next";
import { Suspense } from "react";
import ZonesView from "@/components/zones/ZonesView";

export const metadata: Metadata = { title: "Detection Zones" };

// Opt out of Next.js 16 Turbopack instant-navigation validation for the interactive canvas zone editor
export const instant = false;

export default function ZonesPage() {
  return (
    <Suspense>
      <ZonesView />
    </Suspense>
  );
}
