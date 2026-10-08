import type { Metadata } from "next";
import { Suspense } from "react";
import AdminsView from "@/components/admins/AdminsView";

export const metadata: Metadata = { title: "Admins" };

// Opt out of Next.js 16 Turbopack instant-navigation validation
export const instant = false;

export default function AdminsPage() {
  return (
    <Suspense>
      <AdminsView />
    </Suspense>
  );
}
