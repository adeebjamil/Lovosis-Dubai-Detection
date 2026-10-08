// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into /frontend.
// Reference: frontend/src/app/admin/(panel)/layout.tsx  (protected Volt shell)
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { useAuthStore } from "@/store/auth";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, fetchMe } = useAuthStore();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { fetchMe(); }, [fetchMe]);
  useEffect(() => {
    if (status === "guest") router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== "authenticated") return <PanelSkeleton />;

  return (
    <>
      <Sidebar open={drawer} onClose={() => setDrawer(false)} brandName="Admin Panel" />
      <main className="content">
        <Topbar onMenu={() => setDrawer(true)} />
        {children}
      </main>
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[260px] bg-primary lg:block" />
      <div className="flex-1 space-y-6 p-8">
        <div className="skeleton h-10 w-72" />
        <div className="skeleton h-72 w-full" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="skeleton h-32" />
          <div className="skeleton h-32" />
          <div className="skeleton h-32" />
        </div>
      </div>
    </div>
  );
}
