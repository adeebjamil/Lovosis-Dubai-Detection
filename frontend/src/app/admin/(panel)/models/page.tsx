import type { Metadata } from "next";
import { Suspense } from "react";
import ModelsView from "@/components/models/ModelsView";

export const metadata: Metadata = { title: "AI Models & Training" };

// Opt out of Next.js 16 Turbopack instant-navigation validation
export const instant = false;

export default function ModelsPage() {
  return (
    <Suspense>
      <ModelsView />
    </Suspense>
  );
}
