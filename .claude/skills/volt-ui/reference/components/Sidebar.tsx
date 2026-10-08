// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into the real app.
// Reference: frontend/src/components/layout/Sidebar.tsx
// Volt sidebar — dark navy, active item with indigo border, "Pro"/count badges, collapsible groups.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faChartPie, faInbox, faHandHoldingUsd, faCog, faTable, faChevronRight, faXmark,
} from "@fortawesome/free-solid-svg-icons";

export interface NavItem {
  label: string;
  href?: string;
  icon: IconDefinition;
  badge?: string | number;
  children?: { label: string; href: string }[];
}

// Replace with modules from docs/project-overview.md §4
export const NAV_MAIN: NavItem[] = [
  { label: "Overview", href: "/admin", icon: faChartPie },
  { label: "Messages", href: "/admin/messages", icon: faInbox, badge: "Pro" },
  { label: "Transactions", href: "/admin/transactions", icon: faHandHoldingUsd },
  { label: "Settings", href: "/admin/settings", icon: faCog },
  {
    label: "Tables", icon: faTable,
    children: [{ label: "Bootstrap Table", href: "/admin/tables" }],
  },
];

export const NAV_SECONDARY: NavItem[] = [];

interface SidebarProps {
  open: boolean;          // mobile drawer state
  onClose: () => void;
  brandName: string;
  brandLogo?: React.ReactNode;
}

export default function Sidebar({ open, onClose, brandName, brandLogo }: SidebarProps) {
  const pathname = usePathname();
  const isActive = (href?: string) =>
    !!href && (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <>
      {/* Mobile overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-primary/50 lg:hidden ${open ? "block" : "hidden"}`}
        aria-hidden
      />
      <aside
        id="admin-sidebar"
        className={`sidebar ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="sidebar-brand">
          {brandLogo}
          <span>{brandName}</span>
          <button onClick={onClose} className="ml-auto text-white/80 lg:hidden" aria-label="Close menu">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <nav>
          {NAV_MAIN.map((item) => (
            <SidebarItem key={item.label} item={item} isActive={isActive} onNavigate={onClose} />
          ))}
          {NAV_SECONDARY.length > 0 && <div className="sidebar-divider" />}
          {NAV_SECONDARY.map((item) => (
            <SidebarItem key={item.label} item={item} isActive={isActive} onNavigate={onClose} />
          ))}
        </nav>
      </aside>
    </>
  );
}

function SidebarItem({
  item, isActive, onNavigate,
}: { item: NavItem; isActive: (h?: string) => boolean; onNavigate: () => void }) {
  const childActive = item.children?.some((c) => isActive(c.href)) ?? false;
  const [expanded, setExpanded] = useState(childActive);

  if (item.children) {
    return (
      <div>
        <button
          type="button"
          className="sidebar-link w-full"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <FontAwesomeIcon icon={item.icon} className="sidebar-icon" />
          <span>{item.label}</span>
          <FontAwesomeIcon icon={faChevronRight} className="chevron" />
        </button>
        {expanded && (
          <div className="sidebar-sub">
            {item.children.map((c) => (
              <Link key={c.href} href={c.href} onClick={onNavigate}
                className={`sidebar-link ${isActive(c.href) ? "active" : ""}`}>
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link href={item.href!} onClick={onNavigate}
      className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}>
      <FontAwesomeIcon icon={item.icon} className="sidebar-icon" />
      <span>{item.label}</span>
      {item.badge !== undefined && <span className="badge badge-pro">{item.badge}</span>}
    </Link>
  );
}
