import type { Metadata } from "next";
import { Suspense } from "react";
import ReportsView from "@/components/reports/ReportsView";

export const metadata: Metadata = { title: "Reports" };

// Opt out of Next.js 16 Turbopack instant-navigation validation
export const instant = false;

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsView />
    </Suspense>
  );
}
