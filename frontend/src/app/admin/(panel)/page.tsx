import type { Metadata } from "next";
import { Suspense } from "react";
import OverviewView from "@/components/dashboard/OverviewView";

export const metadata: Metadata = { title: "Overview" };

// Opt out of Next.js 16 Turbopack instant-navigation validation
export const instant = false;

export default function OverviewPage() {
  return (
    <Suspense>
      <OverviewView />
    </Suspense>
  );
}
