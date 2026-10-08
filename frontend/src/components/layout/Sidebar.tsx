"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBrain, faCamera, faChartPie, faChevronRight, faClockRotateLeft, faDrawPolygon,
  faFileLines, faGear, faUsersGear, faVideo, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useAuthStore, type Admin } from "@/store/auth";
import BrandLogo from "@/components/layout/BrandLogo";

export interface NavItem {
  label: string;
  href?: string;
  icon: IconDefinition;
  badge?: string | number;
  roles?: Admin["role"][];
  children?: { label: string; href: string }[];
}

// Source of truth: .claude/docs/project-overview.md §6
export const NAV_MAIN: NavItem[] = [
  { label: "Overview", href: "/admin", icon: faChartPie },
  { label: "Live View", href: "/admin/live", icon: faVideo },
  { label: "Cameras", href: "/admin/cameras", icon: faCamera },
  { label: "Zones & Lines", href: "/admin/zones", icon: faDrawPolygon },
  { label: "Detection History", href: "/admin/history", icon: faClockRotateLeft },
  { label: "Reports", href: "/admin/reports", icon: faFileLines },
];

export const NAV_SECONDARY: NavItem[] = [
  { label: "Models", href: "/admin/models", icon: faBrain },
  { label: "Admins", href: "/admin/admins", icon: faUsersGear, roles: ["SUPER_ADMIN"] },
  { label: "Settings", href: "/admin/settings", icon: faGear },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.admin?.role);
  const isActive = (href?: string) =>
    !!href && (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const visible = (item: NavItem) => !item.roles || (role !== undefined && item.roles.includes(role));

  return (
    <>
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
          <BrandLogo size={30} variant="dark" title="Lovosis Detection" />
          <span className="font-bold tracking-tight">Lovosis <span className="text-secondary">Detection</span></span>
          <button onClick={onClose} className="ml-auto text-white/80 lg:hidden" aria-label="Close menu">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <nav aria-label="Main">
          {NAV_MAIN.filter(visible).map((item) => (
            <SidebarItem key={item.label} item={item} isActive={isActive} onNavigate={onClose} />
          ))}
          <div className="sidebar-divider" />
          {NAV_SECONDARY.filter(visible).map((item) => (
            <SidebarItem key={item.label} item={item} isActive={isActive} onNavigate={onClose} />
          ))}
        </nav>
      </aside>
    </>
  );
}

interface SidebarItemProps {
  item: NavItem;
  isActive: (href?: string) => boolean;
  onNavigate: () => void;
}

function SidebarItem({ item, isActive, onNavigate }: SidebarItemProps) {
  const childActive = item.children?.some((c) => isActive(c.href)) ?? false;
  const [expanded, setExpanded] = useState(childActive);
  const id = `nav-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`;

  if (item.children) {
    return (
      <div>
        <button id={id} type="button" className="sidebar-link w-full" aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}>
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
    <Link id={id} href={item.href!} onClick={onNavigate}
      className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}>
      <FontAwesomeIcon icon={item.icon} className="sidebar-icon" />
      <span>{item.label}</span>
      {item.badge !== undefined && <span className="badge badge-pro">{item.badge}</span>}
    </Link>
  );
}
