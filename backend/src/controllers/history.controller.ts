import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import type { DetectionClass, Gender, NationalityGroup } from "@prisma/client";

export async function getHistory(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;

    const cameraId = req.query.cameraId as string | undefined;
    const detectionClass = req.query.class as DetectionClass | undefined;
    const gender = req.query.gender as Gender | undefined;
    const nationality = req.query.nationality as NationalityGroup | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const where: Record<string, unknown> = {};

    if (cameraId && cameraId !== "ALL") {
      where.cameraId = cameraId;
    }
    if (detectionClass && (detectionClass as string) !== "ALL") {
      where.class = detectionClass;
    }
    if (gender && (gender as string) !== "ALL") {
      where.gender = gender;
    }
    if (nationality && (nationality as string) !== "ALL") {
      where.nationality = nationality;
    }

    if (startDate || endDate) {
      where.firstSeenAt = {};
      if (startDate) (where.firstSeenAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.firstSeenAt as Record<string, Date>).lte = endDate;
    }

    const [total, tracks] = await Promise.all([
      prisma.track.count({ where }),
      prisma.track.findMany({
        where,
        orderBy: { firstSeenAt: "desc" },
        skip,
        take: limit,
        include: {
          camera: {
            select: { id: true, code: true, name: true, location: true },
          },
        },
      }),
    ]);

    // Format BigInt ids safely for JSON
    const data = tracks.map((t) => ({
      id: t.id.toString(),
      cameraId: t.cameraId,
      camera: t.camera,
      trackKey: t.trackKey,
      class: t.class,
      gender: t.gender,
      genderConfidence: t.genderConfidence,
      nationality: t.nationality,
      nationalityConfidence: t.nationalityConfidence,
      confidence: t.confidence,
      firstSeenAt: t.firstSeenAt.toISOString(),
      lastSeenAt: t.lastSeenAt.toISOString(),
      dwellSeconds: t.dwellSeconds,
    }));

    res.json({
      success: true,
      data: {
        tracks: data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    console.error("[history] error fetching history:", error);
    res.status(500).json({ success: false, message: "Failed to fetch detection history" });
  }
}

export async function exportHistoryCsv(req: Request, res: Response) {
  try {
    const cameraId = req.query.cameraId as string | undefined;
    const detectionClass = req.query.class as DetectionClass | undefined;
    const gender = req.query.gender as Gender | undefined;
    const nationality = req.query.nationality as NationalityGroup | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const where: Record<string, unknown> = {};
    if (cameraId && cameraId !== "ALL") where.cameraId = cameraId;
    if (detectionClass && (detectionClass as string) !== "ALL") where.class = detectionClass;
    if (gender && (gender as string) !== "ALL") where.gender = gender;
    if (nationality && (nationality as string) !== "ALL") where.nationality = nationality;
    if (startDate || endDate) {
      where.firstSeenAt = {};
      if (startDate) (where.firstSeenAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.firstSeenAt as Record<string, Date>).lte = endDate;
    }

    const tracks = await prisma.track.findMany({
      where,
      orderBy: { firstSeenAt: "desc" },
      take: 5000,
      include: {
        camera: { select: { code: true, name: true, location: true } },
      },
    });

    const headers = [
      "Track ID",
      "Camera Code",
      "Camera Name",
      "Location",
      "Class",
      "Gender",
      "Gender Conf",
      "Attire / Nationality",
      "Attire Conf",
      "Detection Conf",
      "First Seen (UTC)",
      "Last Seen (UTC)",
      "Dwell Seconds",
    ];

    const rows = tracks.map((t) => [
      t.id.toString(),
      `"${t.camera.code}"`,
      `"${t.camera.name}"`,
      `"${t.camera.location ?? ""}"`,
      t.class,
      t.gender,
      t.genderConfidence ? (t.genderConfidence * 100).toFixed(1) + "%" : "N/A",
      t.nationality,
      t.nationalityConfidence ? (t.nationalityConfidence * 100).toFixed(1) + "%" : "N/A",
      (t.confidence * 100).toFixed(1) + "%",
      t.firstSeenAt.toISOString(),
      t.lastSeenAt.toISOString(),
      t.dwellSeconds.toString(),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lovosis-detections-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[history] export error:", error);
    res.status(500).json({ success: false, message: "Failed to export CSV" });
  }
}
