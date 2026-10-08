"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faCircleExclamation,
  faCircleUser,
  faKey,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { api, apiErrorMessage } from "@/lib/api";

interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
}

export default function ProfileView() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    document.title = "My Profile · Lovosis Detection";
    api
      .get<{ data: AdminProfile }>("/auth/me")
      .then((res) => setProfile(res.data.data))
      .catch((e) => setError(apiErrorMessage(e, "Failed to load profile")))
      .finally(() => setLoading(false));
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    try {
      setSavingPassword(true);
      setError(null);
      setSuccessMsg(null);
      await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setSuccessMsg("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to change password"));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Administrator Profile</h1>
        <p className="text-muted text-sm">
          Account details and security settings for the active session.
        </p>
      </div>

      {error && (
        <div role="alert" className="alert alert-danger flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleExclamation} /> {error}
        </div>
      )}

      {successMsg && (
        <div role="status" className="alert alert-success flex items-center gap-2">
          <FontAwesomeIcon icon={faCheckCircle} /> {successMsg}
        </div>
      )}

      {/* Profile Details Card */}
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleUser} className="text-primary" />
          <h5 className="card-title">Account Information</h5>
        </div>
        <div className="card-body flex items-center gap-5">
          <div className="h-16 w-16 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xl">
            {profile?.name ? profile.name.slice(0, 2).toUpperCase() : "AD"}
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-gray-900 text-lg">
              {loading ? "Loading..." : profile?.name}
            </h4>
            <div className="text-gray-700 text-sm">{profile?.email}</div>
            <div className="pt-1">
              <span className="badge badge-primary inline-flex items-center gap-1.5">
                <FontAwesomeIcon icon={faShieldHalved} />
                {profile?.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <FontAwesomeIcon icon={faKey} className="text-primary" />
          <h5 className="card-title">Update Password</h5>
        </div>
        <div className="card-body">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-800">Current Password</label>
              <input
                id="profile-current-password"
                type="password"
                required
                className="form-control mt-1 w-full"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-800">New Password (min 8 characters)</label>
              <input
                id="profile-new-password"
                type="password"
                required
                minLength={8}
                className="form-control mt-1 w-full"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-800">Confirm New Password</label>
              <input
                id="profile-confirm-password"
                type="password"
                required
                minLength={8}
                className="form-control mt-1 w-full"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                id="btn-update-password"
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={savingPassword}
              >
                {savingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
