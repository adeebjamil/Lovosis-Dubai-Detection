import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function getSettings(_req: Request, res: Response) {
  try {
    const settings = await prisma.setting.findMany();
    const result: Record<string, unknown> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    // Defaults if missing
    const defaults: Record<string, unknown> = {
      timezone: "Asia/Dubai",
      retentionDays: 180,
      detectionConfidence: 0.45,
      genderConfidence: 0.70,
      attireConfidence: 0.65,
      dailyReportTime: "23:55",
      weeklyReportDay: "SUNDAY",
      storeDebugSnapshots: false,
      brandLogo: {
        type: "preset",
        presetId: "cyber-iris",
        customDataUrl: null,
      },
    };

    res.json({
      success: true,
      data: { ...defaults, ...result },
    });
  } catch (error) {
    console.error("[settings] get error:", error);
    res.status(500).json({ success: false, message: "Failed to load settings" });
  }
}

export async function updateSettings(req: Request, res: Response) {
  try {
    const payload = req.body as Record<string, unknown>;

    for (const [key, value] of Object.entries(payload)) {
      if (typeof key === "string" && value !== undefined) {
        await prisma.setting.upsert({
          where: { key },
          update: { value: value as never },
          create: { key, value: value as never },
        });
      }
    }

    const settings = await prisma.setting.findMany();
    const result: Record<string, unknown> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("[settings] update error:", error);
    res.status(500).json({ success: false, message: "Failed to update settings" });
  }
}
