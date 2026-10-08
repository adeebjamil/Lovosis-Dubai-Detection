# Project Overview — 🟢 CONFIRMED (2026-10-07)

## 1. Project name & pitch
**Lovosis Detection** — a fully local (offline) CCTV analytics system for supermarkets/retail.
Connect any IP camera via **RTSP** → realtime people / gender / pet counts → history → daily & weekly reports.
**No external AI services.** All models run locally (Python). Backend Express.js.

## 2. Client context
- Client: UAE retail (supermarket). Timezone **Asia/Dubai**. UI language English.
- Deployment: on-prem, high-end local server ("top system"). Sizing target = average supermarket
  ≈ **16 cameras** (design must scale 8–32) at 10–15 FPS analytics each.
- Cameras: brand not fixed. **Connection only via RTSP URL** entered by admin.

## 3. Admin login
- Seed SUPER_ADMIN: `admin@gmail.com` / `Admin@000` (via `backend/.env` → `ADMIN_SEED_*`, never hard-coded).

## 4. Features (client raw plan → decision)
| # | Requirement | Decision |
|---|-------------|----------|
| 1 | Realtime person count | ✅ Detector + ByteTrack, unique count, line in/out, live occupancy |
| 2 | Male / female counting | ✅ Own trained classifier (face → gender), aggregate only, `unknown` when unsure |
| 3 | Emirati vs non-Emirati from face | ⛔ **Not implemented** — nationality is not inferable from a face; it becomes ethnic profiling + biometric-data risk under UAE PDPL. Offered alternative: consent-based Emirates ID / UAE PASS kiosk data feeding our reports |
| 4 | Pets count (dogs & cats) | ✅ Same detector (COCO dog/cat), fine-tuned on client footage |
| 5 | History + daily/weekly reports | ✅ Events + minute aggregates, cron PDF/Excel reports |

## 5. Locked tech decisions
| Area | Choice | Why |
|------|--------|-----|
| Database | **PostgreSQL 16** + Prisma | Heavy time-series aggregates, JSONB for zone polygons, robust concurrency; already installed locally |
| Detector | **YOLOX (Apache-2.0)**, ONNX Runtime GPU inference | Commercial-safe licence (no AGPL Ultralytics) |
| Tracker | ByteTrack via `supervision` (MIT) | Unique counting |
| Face detect | OpenCV **YuNet** (MIT) | Commercial-safe (InsightFace models are non-commercial) |
| Gender | Own MobileNetV3/EfficientNet (timm, Apache-2.0) trained on **FairFace (CC BY 4.0)** + client data | Commercial-safe |
| Streaming | MediaMTX (MIT) RTSP relay → WebRTC/HLS for browser | Low latency live view |
| Realtime | Detector → Express (WebSocket) → UI (Socket.IO) | |

## 6. Admin sidebar (modules)
| # | Label | Icon (FA solid) | Route |
|---|-------|-----------------|-------|
| 1 | Overview | `faChartPie` | `/admin` |
| 2 | Live View | `faVideo` | `/admin/live` |
| 3 | Cameras | `faCamera` | `/admin/cameras` |
| 4 | Zones & Lines | `faDrawPolygon` | `/admin/zones` |
| 5 | Detection History | `faClockRotateLeft` | `/admin/history` |
| 6 | Reports | `faFileLines` | `/admin/reports` |
| — | divider | | |
| 7 | Models | `faBrain` | `/admin/models` |
| 8 | Admins | `faUsersGear` | `/admin/admins` (SUPER_ADMIN) |
| 9 | Settings | `faGear` | `/admin/settings` |

## 7. Overview dashboard widgets
- Hero chart (cyan Volt card): people count today, hourly (toggle Today / Week)
- Stat cards: Total People Today · Male · Female · Pets (dogs + cats) · Live Occupancy · Cameras Online
- Per-camera live cards, recent detections table

## 8. Phases
P0 scaffold+auth+DB → P1 cameras+live view → P2 realtime detection & counting → P3 history+dashboard →
P4 reports → P5 gender model training → P6 detector fine-tune, perf, deployment.

## 9. Privacy
No face images/crops stored by default; only counts + attributes. Optional debug snapshots auto-purged.
Configurable data retention. Recommend CCTV analytics signage at store.
