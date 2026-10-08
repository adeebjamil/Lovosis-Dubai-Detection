// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into the real app.
// Reference: frontend/src/components/layout/Topbar.tsx
// Volt topbar — sits on body bg; search left; bell + avatar dropdown (with Logout) right.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars, faMagnifyingGlass, faBell, faUserCircle, faCog, faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "@/store/auth";

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const { admin, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasUnread = true; // wire to notifications later

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const handleLogout = async () => {
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
        <input id="topbar-search" type="search" placeholder="Search" className="form-control !h-10 text-sm" />
      </div>

      <div className="ml-auto flex items-center gap-5">
        <button id="topbar-notifications" className="relative text-primary" aria-label="Notifications">
          <FontAwesomeIcon icon={faBell} />
          {hasUnread && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger ring-2 ring-gray-200" />}
        </button>

        <div className="relative" ref={ref}>
          <button id="topbar-user" onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2">
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
              <button className="dropdown-item" onClick={() => router.push("/admin/profile")}>
                <FontAwesomeIcon icon={faUserCircle} /> My Profile
              </button>
              <button className="dropdown-item" onClick={() => router.push("/admin/settings")}>
                <FontAwesomeIcon icon={faCog} /> Settings
              </button>
              <div className="dropdown-divider" />
              <button id="topbar-logout" className="dropdown-item !text-danger" onClick={handleLogout}>
                <FontAwesomeIcon icon={faRightFromBracket} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
