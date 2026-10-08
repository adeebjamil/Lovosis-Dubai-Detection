"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faDrawPolygon, faPlus, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { useCameras } from "@/hooks/useCameras";
import ZoneEditor from "@/components/zones/ZoneEditor";
import type { Camera } from "@/lib/cameras";

export default function ZonesView() {
  const { cameras, error, upsert } = useCameras();
  const [selectedId, setSelectedId] = useState<string>("");

  const list = cameras ?? [];
  const currentCam = list.find((c) => c.id === selectedId) ?? list[0];

  const handleUpdate = (updated: Camera) => {
    upsert(updated);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2.5">
            <FontAwesomeIcon icon={faDrawPolygon} className="text-secondary" />
            Detection Zones & Lines
          </h1>
          <p className="text-sm text-muted mt-1">
            Choose either <strong>Full View (complete CCTV view)</strong> or draw a <strong>Custom Zone polygon</strong> for ROI detection and counting.
          </p>
        </div>

        {list.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="top-cam-select" className="text-sm font-semibold text-primary">
              Switch Camera:
            </label>
            <select
              id="top-cam-select"
              value={currentCam?.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="form-select rounded-lg border-gray-300 py-1.5 text-sm font-medium focus:border-secondary"
            >
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="alert alert-danger flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleExclamation} /> {error}
        </div>
      )}

      {!cameras ? (
        <div className="card p-12 text-center text-muted !shadow-volt">
          <FontAwesomeIcon icon={faRotateRight} className="animate-spin text-2xl mb-3 text-secondary" />
          <p className="text-sm">Loading cameras...</p>
        </div>
      ) : list.length === 0 ? (
        <div className="card p-12 text-center text-muted !shadow-volt">
          <p className="text-base font-semibold text-primary mb-1">No cameras available</p>
          <p className="text-xs mb-4">Please add a camera first before configuring zones.</p>
          <Link href="/admin/cameras?new=1" className="btn btn-primary btn-sm flex items-center gap-1.5 mx-auto w-fit">
            <FontAwesomeIcon icon={faPlus} /> Add Camera
          </Link>
        </div>
      ) : currentCam ? (
        <ZoneEditor key={currentCam.id} camera={currentCam} onUpdate={handleUpdate} />
      ) : null}
    </div>
  );
}
