// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into /frontend.
// Reference: frontend/src/app/layout.tsx  (root)
import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./globals.css";

config.autoAddCss = false; // prevent FA icon flash in Next.js

const nunito = Nunito_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Admin Panel", template: "%s · Admin Panel" }, // rename after overview
  description: "Administration dashboard",
  robots: { index: false, follow: false }, // admin panel should not be indexed
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>{children}</body>
    </html>
  );
}
