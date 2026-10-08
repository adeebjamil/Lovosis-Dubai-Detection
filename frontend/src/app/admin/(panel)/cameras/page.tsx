import type { Metadata } from "next";
import { Suspense } from "react";
import CamerasView from "@/components/cameras/CamerasView";

export const metadata: Metadata = { title: "Cameras" };

export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <CamerasView />
    </Suspense>
  );
}
