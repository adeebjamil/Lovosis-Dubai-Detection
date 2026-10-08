"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import Toaster from "@/components/ui/Toaster";
import { useAuthStore } from "@/store/auth";
import { useBrandStore } from "@/store/brand";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";

export default function PanelShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [drawer, setDrawer] = useState(false);

  // Activate real-time alert listeners across all panel pages
  useRealtimeNotifications();

  useEffect(() => {
    fetchMe();
    useBrandStore.getState().fetchConfig();
  }, [fetchMe]);

  useEffect(() => {
    if (status === "guest") {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  if (status !== "authenticated") {
    return <PanelSkeleton />;
  }

  return (
    <>
      <Sidebar open={drawer} onClose={() => setDrawer(false)} />
      <main className="content">
        <Topbar onMenu={() => setDrawer(true)} />
        {children}
      </main>
      <Toaster />
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-label="Loading">
      <div className="hidden w-[260px] shrink-0 bg-primary lg:block" />
      <div className="flex-1 space-y-6 p-4 lg:p-8">
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
