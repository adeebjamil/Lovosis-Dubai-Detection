import type { Metadata } from "next";
import { Suspense } from "react";
import ProfileView from "@/components/profile/ProfileView";

export const metadata: Metadata = { title: "Profile" };

// Opt out of Next.js 16 Turbopack instant-navigation validation
export const instant = false;

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileView />
    </Suspense>
  );
}
