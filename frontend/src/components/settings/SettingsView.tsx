"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faCircleExclamation,
  faFloppyDisk,
  faRotateRight,
  faSliders,
  faClock,
  faEye,
  faUpload,
  faTrashCan,
  faCheck,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { api, apiErrorMessage } from "@/lib/api";
import BrandLogo from "@/components/layout/BrandLogo";
import { useBrandStore, PRESET_LOGOS, type PresetLogoId, type BrandLogoConfig } from "@/store/brand";

interface SettingsState {
  timezone: string;
  retentionDays: number;
  detectionConfidence: number;
  genderConfidence: number;
  attireConfidence: number;
  dailyReportTime: string;
  weeklyReportDay: string;
  storeDebugSnapshots: boolean;
  brandLogo?: BrandLogoConfig;
}

export default function SettingsView() {
  const [settings, setSettings] = useState<SettingsState>({
    timezone: "Asia/Dubai",
    retentionDays: 180,
    detectionConfidence: 0.45,
    genderConfidence: 0.7,
    attireConfidence: 0.65,
    dailyReportTime: "23:55",
    weeklyReportDay: "SUNDAY",
    storeDebugSnapshots: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Brand Logo Store
  const previewConfig = useBrandStore((s) => s.previewConfig);
  const setBrandPreview = useBrandStore((s) => s.setPreview);
  const resetBrandPreview = useBrandStore((s) => s.resetPreview);
  const saveBrandConfig = useBrandStore((s) => s.saveConfig);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Settings · Lovosis Detection";
    let active = true;
    const load = async () => {
      try {
        const res = await api.get<{ data: SettingsState }>("/settings");
        if (!active) return;
        setSettings(res.data.data);
        if (res.data.data.brandLogo) {
          setBrandPreview(res.data.data.brandLogo);
        }
      } catch (e) {
        if (active) setError(apiErrorMessage(e, "Failed to load settings"));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [setBrandPreview]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: SettingsState }>("/settings");
      setSettings(res.data.data);
      if (res.data.data.brandLogo) {
        setBrandPreview(res.data.data.brandLogo);
      }
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to load settings"));
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (presetId: PresetLogoId) => {
    setUploadError(null);
    setBrandPreview({
      type: "preset",
      presetId,
      customDataUrl: null,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/svg+xml", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("Please upload a transparent SVG, PNG, or WebP image.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Image file must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setBrandPreview({
        type: "custom",
        customDataUrl: dataUrl,
      });
    };
    reader.onerror = () => {
      setUploadError("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustomLogo = () => {
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setBrandPreview({
      type: "preset",
      presetId: previewConfig.presetId || "cyber-iris",
      customDataUrl: null,
    });
  };

  const handleSaveBrandLogoOnly = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      await saveBrandConfig();
      setSuccessMsg("Brand logo updated and synchronized successfully!");
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to save brand logo"));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      await api.put("/settings", {
        ...settings,
        brandLogo: previewConfig,
      });
      await saveBrandConfig();
      setSuccessMsg("All settings saved successfully!");
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">System Settings</h1>
          <p className="text-muted text-sm">
            Configure visual identity & brand logo, detector thresholds, and schedules.
          </p>
        </div>
        <button id="btn-refresh-settings" className="btn btn-outline-gray btn-sm" onClick={handleRefresh}>
          <FontAwesomeIcon icon={faRotateRight} /> Refresh
        </button>
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ================================================================= */}
        {/* BRAND LOGO & VISUAL IDENTITY (Real-time Preview & Dynamic Config) */}
        {/* ================================================================= */}
        <div className="card shadow-sm border border-gray-200">
          <div className="card-header flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50 py-3 px-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FontAwesomeIcon icon={faEye} className="text-sm" />
              </span>
              <div>
                <h5 className="card-title text-base font-bold text-gray-900 m-0">
                  Dashboard Brand Logo & Visual Identity
                </h5>
                <span className="text-2xs text-muted">
                  Strictly visual mark (no text, 100% transparent background) · Real-time live view
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-2xs font-semibold text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Preview
              </span>
              <button
                type="button"
                id="btn-save-logo-only"
                onClick={handleSaveBrandLogoOnly}
                disabled={saving || loading}
                className="btn btn-sm btn-primary inline-flex items-center gap-1.5"
              >
                <FontAwesomeIcon icon={faFloppyDisk} />
                Save Logo
              </button>
            </div>
          </div>

          <div className="card-body p-5 space-y-6">
            {/* Real-time Visual Multi-Surface Preview */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Real-time Dashboard Preview
                </label>
                <span className="text-2xs text-gray-500">
                  {previewConfig.type === "custom" ? "Custom Uploaded Mark" : `Preset: ${previewConfig.presetId}`}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* 1. Dark Navy Sidebar Mockup */}
                <div className="flex flex-col justify-between rounded-lg bg-[#262B40] p-4 text-white shadow-inner">
                  <div className="text-2xs font-medium uppercase tracking-wider text-gray-400 mb-2">
                    Dark Sidebar Surface (Navy #262B40)
                  </div>
                  <div className="flex items-center gap-3 py-3 px-2 rounded-md bg-[#1F2435]/60 border border-white/5">
                    <BrandLogo
                      size={36}
                      variant="dark"
                      config={previewConfig}
                      title="Preview Logo Mark"
                    />
                    <div className="flex flex-col leading-tight">
                      <span className="font-bold text-base tracking-tight text-white">
                        Lovosis <span className="text-[#61DAFB]">Detection</span>
                      </span>
                      <span className="text-2xs text-gray-400">Enterprise AI Surveillance</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-3xs text-gray-400">
                    <span>100% Transparent Background</span>
                    <span className="text-[#61DAFB]">Visual Only</span>
                  </div>
                </div>

                {/* 2. Light Paper / Document Mockup */}
                <div className="flex flex-col justify-between rounded-lg bg-white p-4 text-gray-900 border border-gray-200 shadow-sm">
                  <div className="text-2xs font-medium uppercase tracking-wider text-gray-500 mb-2">
                    Light Surface (Cards / Reports / White)
                  </div>
                  <div className="flex items-center gap-3 py-3 px-2 rounded-md bg-gray-50 border border-gray-100">
                    <BrandLogo
                      size={36}
                      variant="light"
                      config={previewConfig}
                      title="Preview Logo Mark"
                    />
                    <div className="flex flex-col leading-tight">
                      <span className="font-bold text-base tracking-tight text-[#262B40]">
                        Lovosis <span className="text-[#05A677]">Detection</span>
                      </span>
                      <span className="text-2xs text-muted">Inspection & Biometrics</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-3xs text-gray-500">
                    <span>Clean Ink Contrast</span>
                    <span className="text-emerald-600">Zero Artifacts</span>
                  </div>
                </div>
              </div>

              {/* Multi-Scale Verification Bar */}
              <div className="mt-4 pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
                <span className="text-2xs font-bold uppercase tracking-wider text-gray-500">
                  Scale Clarity Test:
                </span>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-1.5" title="Compact 20px">
                    <span className="text-3xs text-muted">20px</span>
                    <div className="p-1 rounded bg-[#262B40]">
                      <BrandLogo size={20} variant="dark" config={previewConfig} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5" title="Standard 28px">
                    <span className="text-3xs text-muted">28px</span>
                    <div className="p-1 rounded bg-[#262B40]">
                      <BrandLogo size={28} variant="dark" config={previewConfig} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5" title="Medium 40px">
                    <span className="text-3xs text-muted">40px</span>
                    <div className="p-1.5 rounded bg-[#262B40]">
                      <BrandLogo size={40} variant="dark" config={previewConfig} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5" title="Large 56px">
                    <span className="text-3xs text-muted">56px</span>
                    <div className="p-1.5 rounded bg-[#262B40]">
                      <BrandLogo size={56} variant="dark" config={previewConfig} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Curated Presets Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Select Visual-Only Preset
                </label>
                {previewConfig.type === "preset" && (
                  <span className="text-2xs font-semibold text-primary">
                    Preset Active: {PRESET_LOGOS.find((p) => p.id === previewConfig.presetId)?.name}
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {PRESET_LOGOS.map((preset) => {
                  const isSelected = previewConfig.type === "preset" && previewConfig.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      id={`preset-logo-${preset.id}`}
                      onClick={() => handlePresetSelect(preset.id)}
                      className={`text-left p-3.5 rounded-xl border transition-all duration-200 flex gap-3.5 items-start ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60"
                      }`}
                    >
                      {/* Logo Preview Icon in Dark Tile to showcase transparent visual */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#262B40] shadow-sm">
                        <BrandLogo
                          size={32}
                          variant="dark"
                          config={{ type: "preset", presetId: preset.id }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h6 className="font-bold text-sm text-gray-900 truncate">{preset.name}</h6>
                          {isSelected && (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white text-3xs shrink-0">
                              <FontAwesomeIcon icon={faCheck} />
                            </span>
                          )}
                        </div>
                        <div className="text-2xs font-medium text-secondary truncate">{preset.subtitle}</div>
                        <p className="text-3xs text-muted mt-1 line-clamp-2 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Transparent Logo Upload Dropzone */}
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Or Upload Custom Logo (Transparent Only)
                </label>
                {previewConfig.type === "custom" && (
                  <button
                    type="button"
                    onClick={handleRemoveCustomLogo}
                    className="text-2xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1 font-semibold"
                  >
                    <FontAwesomeIcon icon={faTrashCan} /> Switch Back to Preset
                  </button>
                )}
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                  previewConfig.type === "custom"
                    ? "border-emerald-400 bg-emerald-50/20"
                    : "border-gray-300 hover:border-primary hover:bg-gray-50/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="brand-logo-file-input"
                  type="file"
                  accept="image/svg+xml,image/png,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {previewConfig.type === "custom" && previewConfig.customDataUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#262B40] p-1.5 shadow-md">
                      <BrandLogo size={42} variant="dark" config={previewConfig} />
                    </div>
                    <div className="text-xs font-bold text-emerald-700">
                      Custom Transparent Logo Active
                    </div>
                    <p className="text-2xs text-muted">
                      Click to replace with a different transparent SVG or PNG.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FontAwesomeIcon icon={faUpload} />
                    </span>
                    <div className="text-xs font-bold text-gray-800">
                      Upload Custom Transparent Logo
                    </div>
                    <p className="text-2xs text-muted max-w-sm">
                      Supports <strong className="font-semibold">.SVG</strong>,{" "}
                      <strong className="font-semibold">.PNG</strong>, or{" "}
                      <strong className="font-semibold">.WebP</strong> with transparency (no background, visual only). Max 2MB.
                    </p>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="text-2xs text-rose-600 mt-1.5 flex items-center gap-1">
                  <FontAwesomeIcon icon={faCircleExclamation} />
                  {uploadError}
                </div>
              )}
            </div>

            {/* Quick sync status indicator */}
            <div className="flex items-center justify-between text-2xs text-muted bg-gray-50 rounded-lg p-2.5">
              <span className="inline-flex items-center gap-1.5">
                <FontAwesomeIcon icon={faShieldHalved} className="text-primary" />
                Theme compliance: Volt Admin Dark Navy (`#262B40`), Volt Cyan (`#61DAFB`), Volt Emerald (`#05A677`).
              </span>
              <span>Visual Mark Only · No Text</span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* Detection Confidence Thresholds */}
        {/* ================================================================= */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <FontAwesomeIcon icon={faSliders} className="text-primary" />
            <h5 className="card-title">AI Confidence & Detection Thresholds</h5>
          </div>
          <div className="card-body space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="setting-detection-conf" className="text-xs font-bold text-gray-800">
                  Object Detection Confidence (YOLOX-s)
                </label>
                <span className="font-mono text-xs font-bold text-primary">
                  {Math.round(settings.detectionConfidence * 100)}%
                </span>
              </div>
              <input
                id="setting-detection-conf"
                type="range"
                min="0.2"
                max="0.9"
                step="0.05"
                className="w-full accent-primary"
                value={settings.detectionConfidence}
                onChange={(e) =>
                  setSettings({ ...settings, detectionConfidence: parseFloat(e.target.value) })
                }
              />
              <span className="text-muted text-2xs">
                Minimum confidence to classify an object as a Person, Dog, or Cat.
              </span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="setting-gender-conf" className="text-xs font-bold text-gray-800">
                  Gender Classifier Confidence
                </label>
                <span className="font-mono text-xs font-bold text-secondary">
                  {Math.round(settings.genderConfidence * 100)}%
                </span>
              </div>
              <input
                id="setting-gender-conf"
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                className="w-full accent-secondary"
                value={settings.genderConfidence}
                onChange={(e) =>
                  setSettings({ ...settings, genderConfidence: parseFloat(e.target.value) })
                }
              />
              <span className="text-muted text-2xs">
                Majority vote confidence threshold required to classify as Male/Female instead of Unknown.
              </span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="setting-attire-conf" className="text-xs font-bold text-gray-800">
                  UAE Attire & Traditional Classifier Confidence
                </label>
                <span className="font-mono text-xs font-bold text-emerald-600">
                  {Math.round(settings.attireConfidence * 100)}%
                </span>
              </div>
              <input
                id="setting-attire-conf"
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                className="w-full accent-emerald-500"
                value={settings.attireConfidence}
                onChange={(e) =>
                  setSettings({ ...settings, attireConfidence: parseFloat(e.target.value) })
                }
              />
              <span className="text-muted text-2xs">
                Luminance and vertical uniformity confidence required to tag as Traditional Kandura/Abaya.
              </span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* Schedule & Retention */}
        {/* ================================================================= */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <FontAwesomeIcon icon={faClock} className="text-primary" />
            <h5 className="card-title">Timezone, Schedules & Data Retention</h5>
          </div>
          <div className="card-body grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="setting-timezone" className="text-xs font-bold text-gray-800">System Timezone</label>
              <select
                id="setting-timezone"
                className="form-select mt-1 w-full"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              >
                <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
                <option value="Asia/Riyadh">Asia/Riyadh (AST, UTC+3)</option>
                <option value="UTC">Coordinated Universal Time (UTC)</option>
              </select>
              <span className="text-muted text-2xs">Timezone used for daily rollups and hourly charts.</span>
            </div>

            <div>
              <label htmlFor="setting-retention" className="text-xs font-bold text-gray-800">Historical Data Retention (Days)</label>
              <input
                id="setting-retention"
                type="number"
                min="30"
                max="365"
                className="form-control mt-1 w-full"
                value={settings.retentionDays}
                onChange={(e) => setSettings({ ...settings, retentionDays: parseInt(e.target.value) || 180 })}
              />
              <span className="text-muted text-2xs">Individual tracks older than this period are purged automatically.</span>
            </div>

            <div>
              <label htmlFor="setting-report-time" className="text-xs font-bold text-gray-800">Daily Report Generation Time</label>
              <input
                id="setting-report-time"
                type="time"
                className="form-control mt-1 w-full"
                value={settings.dailyReportTime}
                onChange={(e) => setSettings({ ...settings, dailyReportTime: e.target.value })}
              />
              <span className="text-muted text-2xs">Time each night to close out daily aggregates.</span>
            </div>

            <div>
              <label htmlFor="setting-weekly-day" className="text-xs font-bold text-gray-800">Weekly Report Closing Day</label>
              <select
                id="setting-weekly-day"
                className="form-select mt-1 w-full"
                value={settings.weeklyReportDay}
                onChange={(e) => setSettings({ ...settings, weeklyReportDay: e.target.value })}
              >
                <option value="SUNDAY">Sunday (Standard UAE working week start)</option>
                <option value="FRIDAY">Friday</option>
                <option value="SATURDAY">Saturday</option>
              </select>
              <span className="text-muted text-2xs">Day of the week when 7-day reports finalize.</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn btn-outline-gray"
            onClick={resetBrandPreview}
            disabled={saving || loading}
          >
            Reset Changes
          </button>
          <button
            id="btn-save-settings"
            type="submit"
            className="btn btn-primary inline-flex items-center gap-2"
            disabled={saving || loading}
          >
            <FontAwesomeIcon icon={faFloppyDisk} />
            {saving ? "Saving Changes..." : "Save All Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
