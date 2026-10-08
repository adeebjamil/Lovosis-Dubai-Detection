"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faCircleExclamation,
  faPlus,
  faRotateRight,
  faShieldHalved,
  faTrash,
  faUser,
  faUsersGear,
} from "@fortawesome/free-solid-svg-icons";
import { api, apiErrorMessage } from "@/lib/api";
import Modal from "@/components/ui/Modal";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminsView() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "SUPER_ADMIN">("ADMIN");

  useEffect(() => {
    document.title = "Admins · Lovosis Detection";
    let active = true;
    const load = async () => {
      try {
        const res = await api.get<{ data: AdminUser[] }>("/admins");
        if (!active) return;
        setAdmins(res.data.data);
      } catch (e) {
        if (active) setError(apiErrorMessage(e, "Failed to load admin accounts"));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: AdminUser[] }>("/admins");
      setAdmins(res.data.data);
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to load admin accounts"));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      await api.post("/admins", { name, email, password, role });
      setSuccessMsg(`Admin account created for ${email}`);
      setModalOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("ADMIN");
      await handleRefresh();
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to create admin"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, adminEmail: string) => {
    if (!confirm(`Are you sure you want to remove admin account ${adminEmail}?`)) return;
    try {
      setError(null);
      await api.delete(`/admins/${id}`);
      setSuccessMsg(`Admin account ${adminEmail} removed`);
      await handleRefresh();
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to delete admin"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Admin Accounts & Access Control</h1>
          <p className="text-muted text-sm">
            Manage authorized staff members with access to the Lovosis Detection dashboard.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button id="btn-refresh-admins" className="btn btn-outline-gray btn-sm" onClick={handleRefresh}>
            <FontAwesomeIcon icon={faRotateRight} /> Refresh
          </button>
          <button id="btn-add-admin" className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
            <FontAwesomeIcon icon={faPlus} /> Add Admin
          </button>
        </div>
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

      {/* Admin Table */}
      <div className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <h5 className="card-title flex items-center gap-2">
            <FontAwesomeIcon icon={faUsersGear} /> Authorized System Users ({admins.length})
          </h5>
        </div>

        {loading ? (
          <div className="card-body space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-volt" id="admins-table">
              <thead>
                <tr>
                  <th>Admin Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs">
                          {a.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-900">{a.name}</span>
                      </div>
                    </td>
                    <td className="text-gray-700">{a.email}</td>
                    <td>
                      {a.role === "SUPER_ADMIN" ? (
                        <span className="badge badge-primary inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faShieldHalved} /> Super Admin
                        </span>
                      ) : (
                        <span className="badge badge-secondary inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faUser} /> Admin
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-success inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    </td>
                    <td className="text-xs text-gray-600">
                      {new Date(a.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="text-right">
                      {a.role !== "SUPER_ADMIN" && (
                        <button
                          className="btn btn-outline-gray btn-xs text-danger hover:bg-danger hover:text-white"
                          title="Delete Admin"
                          onClick={() => handleDelete(a.id, a.email)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Admin Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create New Admin Account">
        <form onSubmit={handleCreate}>
          <div className="modal-body space-y-4">
            <div>
              <label htmlFor="new-admin-name" className="form-label">
                Full Name
              </label>
              <input
                id="new-admin-name"
                type="text"
                required
                className="form-control"
                placeholder="e.g. Tariq Al Mansoori"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="new-admin-email" className="form-label">
                Email Address
              </label>
              <input
                id="new-admin-email"
                type="email"
                required
                className="form-control"
                placeholder="e.g. tariq@lovosis.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="new-admin-password" className="form-label">
                Password <span className="font-normal text-muted">(min 8 characters)</span>
              </label>
              <input
                id="new-admin-password"
                type="password"
                required
                minLength={8}
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="new-admin-role" className="form-label">
                Role
              </label>
              <select
                id="new-admin-role"
                className="form-select"
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "SUPER_ADMIN")}
              >
                <option value="ADMIN">Standard Admin (View cameras, reports, live view)</option>
                <option value="SUPER_ADMIN">Super Admin (Full permissions + admin management)</option>
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-gray" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button id="btn-submit-new-admin" type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Creating Account..." : "Create Admin Account"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
