"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars, faBell, faCircleUser, faGear, faMagnifyingGlass, faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "@/store/auth";
import { useNotificationStore } from "@/store/notifications";
import NotificationDropdown from "@/components/layout/NotificationDropdown";

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const admin = useAuthStore((s) => s.admin);
  const logout = useAuthStore((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);

  const userRef = useRef<HTMLDivElement>(null);
  const notifsRef = useRef<HTMLDivElement>(null);

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) {
        setNotifsOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setNotifsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const go = (path: string) => {
    setMenuOpen(false);
    setNotifsOpen(false);
    router.push(path);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    setNotifsOpen(false);
    await logout();
    router.replace("/admin/login");
  };

  return (
    <header className="flex items-center gap-3 py-4">
      <button id="topbar-menu" onClick={onMenu} className="btn btn-outline-gray btn-sm lg:hidden" aria-label="Open menu">
        <FontAwesomeIcon icon={faBars} />
      </button>

      <div className="input-group w-full max-w-[300px]">
        <span className="input-icon"><FontAwesomeIcon icon={faMagnifyingGlass} /></span>
        <input id="topbar-search" type="search" placeholder="Search" aria-label="Search"
          className="form-control !h-10 text-sm" />
      </div>

      <div className="ml-auto flex items-center gap-4 sm:gap-5">
        {/* Real-time Notifications Bell Dropdown */}
        <div className="relative" ref={notifsRef}>
          <button
            id="topbar-notifications"
            onClick={() => {
              setNotifsOpen((v) => !v);
              setMenuOpen(false);
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-primary hover:bg-gray-200 transition focus:outline-none"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={notifsOpen}
          >
            <FontAwesomeIcon icon={faBell} className="text-base" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notifsOpen && (
            <NotificationDropdown onClose={() => setNotifsOpen(false)} />
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative" ref={userRef}>
          <button id="topbar-user" onClick={() => {
            setMenuOpen((v) => !v);
            setNotifsOpen(false);
          }} className="flex items-center gap-2"
            aria-haspopup="menu" aria-expanded={menuOpen}>
            {admin?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={admin.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {admin?.name?.[0]?.toUpperCase() ?? "A"}
              </span>
            )}
            <span className="hidden text-sm font-semibold text-primary sm:inline">{admin?.name ?? "Admin"}</span>
          </button>

          {menuOpen && (
            <div className="dropdown-menu" role="menu">
              <button id="menu-profile" className="dropdown-item" role="menuitem" onClick={() => go("/admin/profile")}>
                <FontAwesomeIcon icon={faCircleUser} /> My Profile
              </button>
              <button id="menu-settings" className="dropdown-item" role="menuitem" onClick={() => go("/admin/settings")}>
                <FontAwesomeIcon icon={faGear} /> Settings
              </button>
              <div className="dropdown-divider" />
              <button id="topbar-logout" className="dropdown-item !text-danger" role="menuitem" onClick={handleLogout}>
                <FontAwesomeIcon icon={faRightFromBracket} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
