import type { Metadata } from "next";
import { Suspense } from "react";
import HistoryView from "@/components/history/HistoryView";

export const metadata: Metadata = { title: "Detection History" };

// Opt out of Next.js 16 Turbopack instant-navigation validation
export const instant = false;

export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryView />
    </Suspense>
  );
}
