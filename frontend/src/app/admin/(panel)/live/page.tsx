import type { Metadata } from "next";
import LiveView from "@/components/live/LiveView";

export const metadata: Metadata = { title: "Live View" };

export const instant = false;

export default function Page() {
  return <LiveView />;
}
