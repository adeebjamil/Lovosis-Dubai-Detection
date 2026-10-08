"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCamera, faCircleExclamation, faCircleNotch, faPaw, faPen, faPlug, faPlus, faRotateRight, faTrashCan, faUsers,
  faVenusMars, faVideo,
} from "@fortawesome/free-solid-svg-icons";
import { useCameras } from "@/hooks/useCameras";
import { apiErrorMessage } from "@/lib/api";
import { camerasApi, describeProbe, type Camera } from "@/lib/cameras";
import { toast } from "@/store/toast";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import CameraFormModal from "./CameraFormModal";
import CameraStatusBadge from "./CameraStatusBadge";

type FormTarget = { mode: "new" } | { mode: "edit"; camera: Camera } | null;

export default function CamerasView() {
  const router = useRouter();
  const wantsNew = useSearchParams().get("new") === "1";
  const { cameras, limit, error, reload, upsert, removeLocal } = useCameras();
  const [form, setForm] = useState<FormTarget>(null);
  const [toDelete, setToDelete] = useState<Camera | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<Record<string, "test" | "toggle" | undefined>>({});

  // "?new=1" (from Overview "Add Camera") opens the form once; closing clears the param.
  const formOpen = form !== null || wantsNew;
  const editing = form?.mode === "edit" ? form.camera : null;
  const closeForm = () => {
    setForm(null);
    if (wantsNew) router.replace("/admin/cameras");
  };

  const atLimit = (cameras?.length ?? 0) >= limit;
  const online = cameras?.filter((c) => c.status === "ONLINE").length ?? 0;

  const setRowBusy = (id: string, v: "test" | "toggle" | undefined) => setBusy((b) => ({ ...b, [id]: v }));

  const onSaved = (cam: Camera) => {
    upsert(cam);
    toast.success(editing ? `${cam.code} updated` : `${cam.code} added — connecting to the stream…`);
    closeForm();
  };

  const test = async (cam: Camera) => {
    setRowBusy(cam.id, "test");
    try {
      const r = await camerasApi.testSaved(cam.id);
      if (r.ok) toast.success(`${cam.code}: ${describeProbe(r)}`);
      else toast.error(`${cam.code}: ${r.error}`);
      void reload();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Connection test failed."));
    } finally {
      setRowBusy(cam.id, undefined);
    }
  };

  const toggle = async (cam: Camera) => {
    setRowBusy(cam.id, "toggle");
    try {
      upsert(await camerasApi.update(cam.id, { enabled: !cam.enabled }));
    } catch (e) {
      toast.error(apiErrorMessage(e, "Could not update the camera."));
    } finally {
      setRowBusy(cam.id, undefined);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await camerasApi.remove(toDelete.id);
      removeLocal(toDelete.id);
      toast.success(`${toDelete.code} deleted`);
      setToDelete(null);
    } catch (e) {
      toast.error(apiErrorMessage(e, "Could not delete the camera."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button id="btn-add-camera" className="btn btn-primary btn-sm" onClick={() => setForm({ mode: "new" })} disabled={atLimit}
          title={atLimit ? `Camera limit reached (${limit})` : undefined}>
          <FontAwesomeIcon icon={faPlus} /> Add Camera
        </button>
        <div className="btn-group">
          <button id="btn-refresh-cameras" className="btn btn-outline-gray btn-sm" onClick={reload}>
            <FontAwesomeIcon icon={faRotateRight} /> Refresh
          </button>
          <Link id="btn-live-view" href="/admin/live" className="btn btn-outline-gray btn-sm">
            <FontAwesomeIcon icon={faVideo} /> Live View
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-danger flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleExclamation} /> {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h1 className="card-title">Cameras</h1>
            <p className="text-muted">RTSP streams connected to this system</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-success">{online} online</span>
            <span className="badge badge-gray">{cameras?.length ?? 0} / {limit}</span>
          </div>
        </div>

        {!cameras ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        ) : cameras.length === 0 ? (
          <EmptyState
            icon={faCamera}
            title="No cameras yet"
            description="Add your first camera with its RTSP URL. You can test the connection before saving."
            action={
              <button id="empty-add-camera" className="btn btn-primary btn-sm" onClick={() => setForm({ mode: "new" })}>
                <FontAwesomeIcon icon={faPlus} /> Add Camera
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-volt" id="cameras-table">
              <thead>
                <tr>
                  <th>Camera</th>
                  <th>Stream</th>
                  <th>Status</th>
                  <th>Analytics</th>
                  <th>Enabled</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((c) => (
                  <tr key={c.id} id={`camera-row-${c.code}`}>
                    <td>
                      <div className="text-xs font-bold text-gray-700">{c.code}</div>
                      <div className="font-semibold text-primary">{c.name}</div>
                      {c.location && <div className="text-xs text-gray-700">{c.location}</div>}
                    </td>
                    <td className="max-w-[18rem]">
                      <div className="truncate font-mono text-xs text-gray-900" title={c.rtspUrl}>{c.rtspUrl}</div>
                      <div className="text-xs text-gray-700">{c.width && c.height ? `${c.width}×${c.height}` : "Resolution unknown"}</div>
                    </td>
                    <td>
                      <CameraStatusBadge status={c.status} title={c.lastError} />
                      {c.lastError && c.status !== "ONLINE" && (
                        <div className="mt-1 max-w-[14rem] truncate text-xs text-danger" title={c.lastError}>{c.lastError}</div>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-3 text-gray-600">
                        <FontAwesomeIcon icon={faUsers} title="People counting" className={c.detectPersons ? "text-primary" : ""} />
                        <FontAwesomeIcon icon={faVenusMars} title="Male / female" className={c.detectGender ? "text-primary" : ""} />
                        <FontAwesomeIcon icon={faPaw} title="Pets" className={c.detectPets ? "text-primary" : ""} />
                        <span className="text-xs font-semibold text-gray-700">{c.analyticsFps} fps</span>
                      </div>
                    </td>
                    <td>
                      <label className="form-switch" title={c.enabled ? "Disable camera" : "Enable camera"}>
                        <input id={`camera-enabled-${c.code}`} type="checkbox" checked={c.enabled} disabled={!!busy[c.id]}
                          onChange={() => toggle(c)} aria-label={`${c.enabled ? "Disable" : "Enable"} ${c.name}`} />
                      </label>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button id={`camera-test-${c.code}`} className="btn-icon" onClick={() => test(c)} disabled={!!busy[c.id]}
                          title="Test connection" aria-label={`Test ${c.name}`}>
                          <FontAwesomeIcon icon={busy[c.id] === "test" ? faCircleNotch : faPlug} spin={busy[c.id] === "test"} />
                        </button>
                        <button id={`camera-edit-${c.code}`} className="btn-icon" onClick={() => setForm({ mode: "edit", camera: c })}
                          title="Edit" aria-label={`Edit ${c.name}`}>
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                        <button id={`camera-delete-${c.code}`} className="btn-icon btn-icon-danger" onClick={() => setToDelete(c)}
                          title="Delete" aria-label={`Delete ${c.name}`}>
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CameraFormModal open={formOpen} camera={editing} onClose={closeForm} onSaved={onSaved} />

      <Modal
        open={toDelete !== null}
        title="Delete camera?"
        size="sm"
        locked={deleting}
        onClose={() => setToDelete(null)}
        id="camera-delete-modal"
        footer={
          <>
            <button className="btn btn-outline-gray" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</button>
            <button id="camera-delete-confirm" className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? (<><FontAwesomeIcon icon={faCircleNotch} spin /> Deleting…</>) : "Delete"}
            </button>
          </>
        }
      >
        <div className="modal-body text-sm">
          <strong className="text-primary">{toDelete?.code} · {toDelete?.name}</strong> will be removed together with its zones
          and detection history. This cannot be undone.
        </div>
      </Modal>
    </div>
  );
}
