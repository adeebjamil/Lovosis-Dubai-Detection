# Client Follow-Up & Architecture Discussion
**Date:** October 8, 2026  
**Project:** Lovosis Dubai AI Detection System  
**Status:** In Discussion / Planned for Next Phase  

---

## 1. Executive Summary
During the client review on October 8, 2026, the client proposed an architectural evolution of the camera layout and dashboard presentation:
1. **Camera Role Separation (8-Camera Distributed Architecture):** Divide tasks between dedicated overhead cameras (for people counting) and front-facing cameras (for identification/classification).
2. **Dedicated Modular Analytics Dashboards:** Create isolated, role-specific analytics views for People Counting, Demographics (Male/Female), Cultural Attire (Emirati/Non-Emirati), and Pets.

---

## 2. Camera Layout & Distributed Load Architecture

### Proposed Camera Deployment (4 Entrances × 2 Cameras = 8 Total)

```
       Entrance Door Top View
       ┌───────────────────────────────┐
       │ [Cam 1-4: Overhead Top-Down]  │ ──> Dedicated People Counting (Zero Occlusion)
       │        (Above Door)           │
       └───────────────────────────────┘
                      │
                      ▼ (Walking in)
       ┌───────────────────────────────┐
       │ [Cam 5-8: Frontal Eye-Level]  │ ──> Dedicated Identification (Faces, Attire, Pets)
       │       (In Front of Door)      │
       └───────────────────────────────┘
```

### Camera Breakdown

| Camera Set | Placement & Angle | Primary Task | Model Pipeline | Compute Profile |
| :--- | :--- | :--- | :--- | :--- |
| **Cam 1–4** (Existing) | Overhead / Above entrance doors (Top-Down) | **Footfall Counting (In/Out/Dwell)** | High-FPS YOLOX + ByteTrack (Line/Zone Crossing) | Lightweight (Fast, <15ms/frame, 25-30 FPS) |
| **Cam 5–8** (New Addition) | Frontal / Eye-to-chest level in front of doors | **Identification & Demographics** | Face Detection (YuNet) + Gender (InsightFace) + Attire (Kandura/Abaya) + Pets | Deep Learning Keyframe Pipeline |

### Key Benefits:
1. **Zero Occlusion on Counting:** Top-down angle eliminates body overlap when groups enter together. Counting accuracy reaches 99.5%+.
2. **Maximum Facial & Attire Clarity:** Frontal view captures faces, Ghutra/Shemagh, Shayla, Kandura, Abaya, and pet leashes clearly.
3. **Hardware Load Balancing:** No single camera stream is overloaded with both high-frequency line crossing and multi-model deep learning.

---

## 3. Modular Analytics Pages Requirement

The client requested separate, specialized views so stakeholders can view only the analytics relevant to their department:

### 1. 👥 People Flow Analytics View
* **Audience:** Operations & Facility Managers
* **Metrics:**
  * Total Entries Today & Trend vs Yesterday
  * Door-by-Door Traffic Breakdown (Entrance 1, 2, 3, 4)
  * Peak Hourly Influx Curve (Real-time Flow)
  * Real-time Occupancy & Average Dwell Time

### 2. 🇦🇪 Cultural Attire & Demographic Analytics View
* **Audience:** Management, VIP Relations & Security
* **Metrics:**
  * Emirati (Traditional Kandura & Abaya) vs Non-Emirati Breakdown
  * Local Cultural Attire Percentages & Hourly Distribution
  * VIP / Local Visiting Peak Trends

### 3. 🚻 Gender & Demographics Analytics View
* **Audience:** Marketing & Customer Experience
* **Metrics:**
  * Male vs Female Distribution Ratios
  * Time-of-day demographic shifts
  * Sustained dwell times by demographic group

### 4. 🐾 Pets & Animals Analytics View
* **Audience:** Property Safety & Animal Control
* **Metrics:**
  * Total Pets Count Today (Dogs vs Cats)
  * Pet-friendly entrance utilization
  * Peak pet entry hours

---

## 4. Current Build Readiness & Compatibility

| Requirement | Current Status in Lovosis Codebase | Action Needed for Next Phase |
| :--- | :--- | :--- |
| **Per-Camera Feature Flags** | Supported in Prisma & detector (`detectPersons`, `detectGender`, `detectPets`, `detectNationality`) | Assign Cam 1–4 only `detectPersons`, Cam 5–8 all flags. |
| **Zone & Multi-Camera Ingestion** | Supported via MediaMTX & WebSocket bridge | Add cameras 5–8 configs in admin dashboard. |
| **Database Aggregations** | Supported via `MinuteAggregate` (tracks by camera, class, gender, nationality) | Ready as-is. |
| **Frontend Dedicated Views** | Single unified Overview dashboard currently | Add tab navigation or dedicated sub-pages in frontend navigation. |

---

## 5. Next Steps
- Finalize camera IP addresses and mounting positions on-site in Dubai.
- Test 8-camera concurrent streams on the Dubai PC.
- Implement dedicated frontend tabs upon client confirmation.
