"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt, faCircleCheck, faCircleExclamation, faCircleNotch, faEye, faEyeSlash, faLightbulb, faLink, faPlug, faUser,
} from "@fortawesome/free-solid-svg-icons";
import Modal from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api";
import {
  camerasApi,
  convertStreamUrl,
  describeProbe,
  detectStreamProfile,
  isRtspUrl,
  stripCredentials,
  type Camera,
  type ProbeResult,
} from "@/lib/cameras";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Max 80 characters"),
  location: z.string().trim().max(120, "Max 120 characters"),
  rtspUrl: z.string().trim().refine(isRtspUrl, "Enter a valid RTSP URL starting with rtsp://"),
  username: z.string().trim().max(128),
  password: z.string().max(256),
  analyticsFps: z.number().int().min(1).max(25),
  enabled: z.boolean(),
  detectPersons: z.boolean(),
  detectGender: z.boolean(),
  detectPets: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const FPS_OPTIONS = [5, 8, 10, 12, 15];

const URL_FORMATS: [string, string, string][] = [
  ["Hikvision / Prama", "rtsp://IP:554/Streaming/Channels/101", "rtsp://IP:554/Streaming/Channels/102"],
  ["Dahua / CP Plus / Amcrest", "rtsp://IP:554/cam/realmonitor?channel=1&subtype=0", "rtsp://IP:554/cam/realmonitor?channel=1&subtype=1"],
  ["Uniview (UNV)", "rtsp://IP:554/unicast/c1/s0/live", "rtsp://IP:554/unicast/c1/s1/live"],
  ["Axis", "rtsp://IP:554/axis-media/media.amp", "rtsp://IP:554/axis-media/media.amp?resolution=640x360"],
  ["Hanwha / Wisenet", "rtsp://IP:554/profile1/media.smp", "rtsp://IP:554/profile2/media.smp"],
  ["Milesight / Tiandy / Generic", "rtsp://IP:554/media/video1", "rtsp://IP:554/media/video2"],
];

interface Props {
  open: boolean;
  camera?: Camera | null;
  onClose: () => void;
  onSaved: (camera: Camera) => void;
}

function defaults(camera?: Camera | null): FormValues {
  return {
    name: camera?.name ?? "",
    location: camera?.location ?? "",
    rtspUrl: camera ? stripCredentials(camera.rtspUrl) : "",
    username: camera?.username ?? "",
    password: "",
    analyticsFps: camera?.analyticsFps ?? 10,
    enabled: camera?.enabled ?? true,
    detectPersons: camera?.detectPersons ?? true,
    detectGender: camera?.detectGender ?? true,
    detectPets: camera?.detectPets ?? true,
  };
}

export default function CameraFormModal({ open, camera, onClose, onSaved }: Props) {
  // Remount the form whenever the target camera changes → fresh defaults without effects.
  return (
    <Modal open={open} title={camera ? `Edit ${camera.code}` : "Add Camera"} onClose={onClose} id="camera-form-modal">
      <CameraForm key={camera?.id ?? "new"} camera={camera} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function CameraForm({ camera, onClose, onSaved }: Omit<Props, "open">) {
  const isEdit = Boolean(camera);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);

  const {
    register, handleSubmit, control, trigger, getValues, setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(camera) });
  const detectPersons = useWatch({ control, name: "detectPersons" });
  const currentRtspUrl = useWatch({ control, name: "rtspUrl" });
  const currentProfile = detectStreamProfile(currentRtspUrl || "", camera?.height);

  const handleSelectProfile = (targetProfile: "MAINSTREAM" | "SUBSTREAM") => {
    const current = getValues("rtspUrl");
    if (!current) return;
    const converted = convertStreamUrl(current, targetProfile);
    setValue("rtspUrl", converted, { shouldValidate: true, shouldDirty: true });
    setProbe(null);
  };

  const payload = (v: FormValues) => ({
    name: v.name,
    location: v.location || null,
    rtspUrl: v.rtspUrl,
    username: v.username || null,
    password: v.password || null,
    analyticsFps: v.analyticsFps,
    enabled: v.enabled,
    detectPersons: v.detectPersons,
    detectGender: v.detectPersons && v.detectGender,
    detectPets: v.detectPets,
  });

  const runTest = async () => {
    if (!(await trigger("rtspUrl"))) return;
    const v = getValues();
    setTesting(true);
    setProbe(null);
    try {
      const unchangedSaved =
        camera && !v.password && v.rtspUrl.trim() === stripCredentials(camera.rtspUrl) && (v.username || null) === camera.username;
      setProbe(
        unchangedSaved
          ? await camerasApi.testSaved(camera.id)
          : await camerasApi.test({
              rtspUrl: v.rtspUrl,
              username: v.username || null,
              password: v.password || null,
              cameraId: camera?.id,
            }),
      );
    } catch (e) {
      setProbe({ ok: false, error: apiErrorMessage(e, "Connection test failed."), latencyMs: 0 });
    } finally {
      setTesting(false);
    }
  };

  const onSubmit = async (v: FormValues) => {
    setServerError(null);
    try {
      const saved = camera ? await camerasApi.update(camera.id, payload(v)) : await camerasApi.create(payload(v));
      onSaved(saved);
    } catch (e) {
      setServerError(apiErrorMessage(e, "Could not save the camera."));
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="modal-body space-y-5">
        {serverError && (
          <div role="alert" className="alert alert-danger flex items-center gap-2">
            <FontAwesomeIcon icon={faCircleExclamation} /> {serverError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cam-name" className="form-label">Camera name</label>
            <input id="cam-name" autoFocus placeholder="Main Entrance" aria-invalid={!!errors.name}
              className={`form-control ${errors.name ? "is-invalid" : ""}`} {...register("name")} />
            {errors.name && <p className="invalid-feedback">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="cam-location" className="form-label">Location <span className="font-normal text-gray-700">(optional)</span></label>
            <input id="cam-location" placeholder="Ground floor · Gate A" aria-invalid={!!errors.location}
              className={`form-control ${errors.location ? "is-invalid" : ""}`} {...register("location")} />
            {errors.location && <p className="invalid-feedback">{errors.location.message}</p>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <label htmlFor="cam-rtsp" className="form-label !mb-0">RTSP Stream URL</label>
            <div className="flex items-center gap-1.5 bg-gray-200 dark:bg-gray-800 p-0.5 rounded-md">
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium px-1">Feed:</span>
              <button
                type="button"
                id="btn-select-mainstream"
                onClick={() => handleSelectProfile("MAINSTREAM")}
                className={`px-2.5 py-1 text-xs rounded font-bold transition-all flex items-center gap-1.5 ${
                  currentProfile === "MAINSTREAM"
                    ? "bg-primary text-white shadow-xs"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
                }`}
                title="Mainstream (1080p / 2K / 4K) — 3x farther AI detection distance"
              >
                <FontAwesomeIcon icon={faBolt} className="text-[10px]" />
                Mainstream (HD/2K)
              </button>
              <button
                type="button"
                id="btn-select-substream"
                onClick={() => handleSelectProfile("SUBSTREAM")}
                className={`px-2.5 py-1 text-xs rounded font-bold transition-all flex items-center gap-1.5 ${
                  currentProfile === "SUBSTREAM"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
                }`}
                title="Substream (SD / D1 / CIF) — Low bandwidth & smooth playback"
              >
                Substream (SD)
              </button>
            </div>
          </div>

          <div className="input-group">
            <span className="input-icon"><FontAwesomeIcon icon={faLink} /></span>
            <input id="cam-rtsp" spellCheck={false} autoComplete="off" placeholder="rtsp://192.168.1.64:554/Streaming/Channels/101"
              aria-invalid={!!errors.rtspUrl} className={`form-control font-mono !text-sm ${errors.rtspUrl ? "is-invalid" : ""}`}
              {...register("rtspUrl", { onChange: () => setProbe(null) })} />
          </div>
          {errors.rtspUrl ? (
            <p className="invalid-feedback">{errors.rtspUrl.message}</p>
          ) : (
            <p className="form-text">Paste the full URL or use the buttons above to toggle between Mainstream (HD) and Substream (SD).</p>
          )}

          {/* Pro Tip Callout Box for Outdoor & Long-Range Detection */}
          {currentProfile === "SUBSTREAM" ? (
            <div className="mt-2.5 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2.5">
                <FontAwesomeIcon icon={faLightbulb} className="text-amber-500 mt-0.5 text-sm shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center justify-between">
                    <span>💡 Pro Tip for Outdoor Cameras &amp; Long-Range Detection:</span>
                    <span className="badge badge-warning text-[10px]">SUBSTREAM ACTIVE</span>
                  </div>
                  <p className="leading-relaxed text-gray-800 dark:text-amber-200/90">
                    Agar road ke piche chalte hue logon ko bhi door se pakadna hai, toh camera ke settings me jakar AI feed ko <strong>Substream (720×576)</strong> se <strong>Mainstream (1080p ya 2K)</strong> par switch karein, jisse detection distance <strong>3 guna barh jayegi!</strong>
                  </p>
                  <div>
                    <button
                      type="button"
                      id="btn-quick-switch-mainstream"
                      onClick={() => handleSelectProfile("MAINSTREAM")}
                      className="btn btn-xs bg-amber-500 text-gray-950 font-bold hover:bg-amber-400 border-none inline-flex items-center gap-1.5 py-1 px-3 shadow-xs rounded cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faBolt} /> Switch to Mainstream (3x Detection Range)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faBolt} className="text-emerald-500 shrink-0" />
                <span>
                  <strong>Mainstream Active (HD / 2K):</strong> Maximum detection distance active (up to 30–45m on outdoor roads).
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleSelectProfile("SUBSTREAM")}
                className="text-[11px] underline text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 shrink-0 font-medium"
              >
                Switch to Substream (SD)
              </button>
            </div>
          )}

          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-semibold text-primary">Common URL formats (Mainstream vs Substream)</summary>
            <ul className="mt-2 space-y-2 rounded-[0.5rem] bg-gray-200 dark:bg-gray-800/70 p-3 text-xs">
              {URL_FORMATS.map(([brand, mainUrl, subUrl]) => (
                <li key={brand} className="flex flex-col gap-0.5 border-b border-gray-300/60 dark:border-gray-700 pb-1.5 last:border-0 last:pb-0">
                  <span className="font-bold text-gray-900 dark:text-gray-100">{brand}</span>
                  <div className="flex flex-wrap gap-x-3 text-[11px]">
                    <span className="text-gray-600 dark:text-gray-400">Main (HD): <code className="break-all text-primary font-mono">{mainUrl}</code></span>
                    <span className="text-gray-600 dark:text-gray-400">Sub (SD): <code className="break-all text-amber-600 font-mono">{subUrl}</code></span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cam-username" className="form-label">Username <span className="font-normal text-gray-700">(optional)</span></label>
            <div className="input-group">
              <span className="input-icon"><FontAwesomeIcon icon={faUser} /></span>
              <input id="cam-username" autoComplete="off" placeholder="admin" className="form-control"
                {...register("username", { onChange: () => setProbe(null) })} />
            </div>
          </div>
          <div>
            <label htmlFor="cam-password" className="form-label">Password <span className="font-normal text-gray-700">(optional)</span></label>
            <div className="input-group">
              <input id="cam-password" type={showPw ? "text" : "password"} autoComplete="new-password"
                placeholder={isEdit && camera?.hasPassword ? "•••••••• (unchanged)" : "Camera password"}
                className="form-control !pl-3 !pr-11" {...register("password", { onChange: () => setProbe(null) })} />
              <button id="cam-toggle-password" type="button" className="input-action" onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}>
                <FontAwesomeIcon icon={showPw ? faEyeSlash : faEye} />
              </button>
            </div>
            {isEdit && camera?.hasPassword && <p className="form-text">Leave empty to keep the saved password.</p>}
          </div>
        </div>

        {probe && (
          <div id="cam-test-result" role="status" className={`alert flex items-start gap-2 ${probe.ok ? "alert-success" : "alert-danger"}`}>
            <FontAwesomeIcon icon={probe.ok ? faCircleCheck : faCircleExclamation} className="mt-0.5" />
            <span>{describeProbe(probe)}</span>
          </div>
        )}

        <div className="border-t border-gray-400 pt-5">
          <h6 className="mb-3 text-sm font-semibold text-primary">Analytics</h6>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-start gap-3">
              <label className="form-switch">
                <input id="cam-detect-persons" type="checkbox" {...register("detectPersons")} /> People counting
              </label>
              <label className="form-switch">
                <input id="cam-detect-gender" type="checkbox" disabled={!detectPersons} {...register("detectGender")} /> Male / female
              </label>
              <label className="form-switch">
                <input id="cam-detect-pets" type="checkbox" {...register("detectPets")} /> Pets (dogs &amp; cats)
              </label>
            </div>
            <div>
              <label htmlFor="cam-fps" className="form-label">Analytics FPS</label>
              <select id="cam-fps" className="form-control" {...register("analyticsFps", { valueAsNumber: true })}>
                {FPS_OPTIONS.map((f) => <option key={f} value={f}>{f} fps</option>)}
              </select>
              <p className="form-text">Frames analysed per second. 10 fps is accurate for walking people.</p>
            </div>
          </div>
          <label className="form-switch mt-4">
            <input id="cam-enabled" type="checkbox" {...register("enabled")} /> Camera enabled
          </label>
        </div>
      </div>

      <div className="modal-footer">
        <button id="cam-test" type="button" className="btn btn-outline-gray mr-auto" onClick={runTest} disabled={testing || isSubmitting}>
          <FontAwesomeIcon icon={testing ? faCircleNotch : faPlug} spin={testing} /> {testing ? "Testing…" : "Test connection"}
        </button>
        <button id="cam-cancel" type="button" className="btn btn-outline-gray" onClick={onClose} disabled={isSubmitting}>Cancel</button>
        <button id="cam-save" type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? (<><FontAwesomeIcon icon={faCircleNotch} spin /> Saving…</>) : isEdit ? "Save changes" : "Add camera"}
        </button>
      </div>
    </form>
  );
}
