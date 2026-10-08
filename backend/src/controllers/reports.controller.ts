import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// Dubai is UTC+4
const DUBAI_OFFSET_HOURS = 4;

function getDubaiDayRange(dateStr?: string) {
  // If no date provided, use current date in Dubai
  const now = new Date();
  const dubaiTime = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 3600 * 1000);
  const targetDate = dateStr ? new Date(`${dateStr}T00:00:00Z`) : new Date(Date.UTC(dubaiTime.getUTCFullYear(), dubaiTime.getUTCMonth(), dubaiTime.getUTCDate()));

  // Start of day in Dubai: 00:00 Dubai = (00:00 - 4h) = 20:00 previous day UTC
  const startUtc = new Date(targetDate.getTime() - DUBAI_OFFSET_HOURS * 3600 * 1000);
  const endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000 - 1);

  return { startUtc, endUtc, dateStr: targetDate.toISOString().slice(0, 10) };
}

export async function getDailyReport(req: Request, res: Response) {
  try {
    const { startUtc, endUtc, dateStr } = getDubaiDayRange(req.query.date as string | undefined);

    const [tracks, cameras] = await Promise.all([
      prisma.track.findMany({
        where: {
          firstSeenAt: { gte: startUtc, lte: endUtc },
        },
        select: {
          cameraId: true,
          class: true,
          gender: true,
          nationality: true,
          firstSeenAt: true,
          dwellSeconds: true,
        },
      }),
      prisma.camera.findMany({
        select: { id: true, code: true, name: true, location: true },
      }),
    ]);

    let people = 0;
    let male = 0;
    let female = 0;
    let unknownGender = 0;
    let emirati = 0;
    let nonEmirati = 0;
    let unknownNationality = 0;
    let dogs = 0;
    let cats = 0;

    // Hourly buckets (00:00 - 23:00 Dubai time)
    const hourly: Array<{
      hour: string;
      people: number;
      male: number;
      female: number;
      emirati: number;
      nonEmirati: number;
      pets: number;
    }> = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      people: 0,
      male: 0,
      female: 0,
      emirati: 0,
      nonEmirati: 0,
      pets: 0,
    }));

    // Camera stats map
    const camStats: Record<string, {
      code: string;
      name: string;
      location: string | null;
      people: number;
      male: number;
      female: number;
      emirati: number;
      nonEmirati: number;
      dogs: number;
      cats: number;
    }> = {};

    for (const c of cameras) {
      camStats[c.id] = {
        code: c.code,
        name: c.name,
        location: c.location,
        people: 0,
        male: 0,
        female: 0,
        emirati: 0,
        nonEmirati: 0,
        dogs: 0,
        cats: 0,
      };
    }

    for (const tr of tracks) {
      // Convert to Dubai local hour
      const dLocal = new Date(tr.firstSeenAt.getTime() + DUBAI_OFFSET_HOURS * 3600 * 1000);
      const h = dLocal.getUTCHours();
      const bucket = hourly[h];

      const cStat = camStats[tr.cameraId];

      if (tr.class === "PERSON") {
        people++;
        if (bucket) bucket.people++;
        if (cStat) cStat.people++;

        if (tr.gender === "MALE") {
          male++;
          if (bucket) bucket.male++;
          if (cStat) cStat.male++;
        } else if (tr.gender === "FEMALE") {
          female++;
          if (bucket) bucket.female++;
          if (cStat) cStat.female++;
        } else {
          unknownGender++;
        }

        if (tr.nationality === "EMIRATI") {
          emirati++;
          if (bucket) bucket.emirati++;
          if (cStat) cStat.emirati++;
        } else if (tr.nationality === "NON_EMIRATI") {
          nonEmirati++;
          if (bucket) bucket.nonEmirati++;
          if (cStat) cStat.nonEmirati++;
        } else {
          unknownNationality++;
        }
      } else if (tr.class === "DOG") {
        dogs++;
        if (bucket) bucket.pets++;
        if (cStat) cStat.dogs++;
      } else if (tr.class === "CAT") {
        cats++;
        if (bucket) bucket.pets++;
        if (cStat) cStat.cats++;
      }
    }

    // Find peak hour
    let peakHour = "12:00";
    let peakCount = -1;
    for (const b of hourly) {
      if (b.people > peakCount) {
        peakCount = b.people;
        peakHour = b.hour;
      }
    }

    res.json({
      success: true,
      data: {
        date: dateStr,
        summary: {
          people,
          male,
          female,
          unknownGender,
          emirati,
          nonEmirati,
          unknownNationality,
          dogs,
          cats,
          totalPets: dogs + cats,
          peakHour: peakCount > 0 ? peakHour : "N/A",
          peakPeopleCount: Math.max(0, peakCount),
        },
        hourly,
        byCamera: Object.values(camStats),
      },
    });
  } catch (error) {
    console.error("[reports] daily error:", error);
    res.status(500).json({ success: false, message: "Failed to generate daily report" });
  }
}

export async function getWeeklyReport(req: Request, res: Response) {
  try {
    const now = new Date();
    const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 3600 * 1000);

    // End is end of today
    const endDate = req.query.endDate ? new Date(`${req.query.endDate}T23:59:59Z`) : new Date(Date.UTC(dubaiNow.getUTCFullYear(), dubaiNow.getUTCMonth(), dubaiNow.getUTCDate(), 23, 59, 59));
    const endUtc = new Date(endDate.getTime() - DUBAI_OFFSET_HOURS * 3600 * 1000);
    const startUtc = new Date(endUtc.getTime() - 7 * 24 * 3600 * 1000 + 1000);

    const [tracks, cameras] = await Promise.all([
      prisma.track.findMany({
        where: { firstSeenAt: { gte: startUtc, lte: endUtc } },
        select: {
          cameraId: true,
          class: true,
          gender: true,
          nationality: true,
          firstSeenAt: true,
        },
      }),
      prisma.camera.findMany({ select: { id: true, code: true, name: true } }),
    ]);

    const daysMap: Record<string, {
      date: string;
      dayName: string;
      people: number;
      male: number;
      female: number;
      emirati: number;
      nonEmirati: number;
      pets: number;
    }> = {};

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(endUtc.getTime() - i * 24 * 3600 * 1000);
      const dLocal = new Date(d.getTime() + DUBAI_OFFSET_HOURS * 3600 * 1000);
      const key = dLocal.toISOString().slice(0, 10);
      daysMap[key] = {
        date: key,
        dayName: dayNames[dLocal.getUTCDay()],
        people: 0,
        male: 0,
        female: 0,
        emirati: 0,
        nonEmirati: 0,
        pets: 0,
      };
    }

    let totalPeople = 0;
    let totalMale = 0;
    let totalFemale = 0;
    let totalEmirati = 0;
    let totalNonEmirati = 0;
    let totalDogs = 0;
    let totalCats = 0;

    for (const tr of tracks) {
      const dLocal = new Date(tr.firstSeenAt.getTime() + DUBAI_OFFSET_HOURS * 3600 * 1000);
      const key = dLocal.toISOString().slice(0, 10);
      const day = daysMap[key];

      if (tr.class === "PERSON") {
        totalPeople++;
        if (day) day.people++;
        if (tr.gender === "MALE") {
          totalMale++;
          if (day) day.male++;
        } else if (tr.gender === "FEMALE") {
          totalFemale++;
          if (day) day.female++;
        }

        if (tr.nationality === "EMIRATI") {
          totalEmirati++;
          if (day) day.emirati++;
        } else if (tr.nationality === "NON_EMIRATI") {
          totalNonEmirati++;
          if (day) day.nonEmirati++;
        }
      } else if (tr.class === "DOG") {
        totalDogs++;
        if (day) day.pets++;
      } else if (tr.class === "CAT") {
        totalCats++;
        if (day) day.pets++;
      }
    }

    res.json({
      success: true,
      data: {
        periodStart: startUtc.toISOString().slice(0, 10),
        periodEnd: endUtc.toISOString().slice(0, 10),
        summary: {
          people: totalPeople,
          male: totalMale,
          female: totalFemale,
          emirati: totalEmirati,
          nonEmirati: totalNonEmirati,
          dogs: totalDogs,
          cats: totalCats,
          totalPets: totalDogs + totalCats,
          dailyAverage: Math.round(totalPeople / 7),
        },
        daily: Object.values(daysMap),
        camerasCount: cameras.length,
      },
    });
  } catch (error) {
    console.error("[reports] weekly error:", error);
    res.status(500).json({ success: false, message: "Failed to generate weekly report" });
  }
}

export async function exportReportCsv(req: Request, res: Response) {
  try {
    const type = (req.query.type as string) || "daily";
    const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    if (type === "daily") {
      const { startUtc, endUtc } = getDubaiDayRange(dateStr);
      const tracks = await prisma.track.findMany({
        where: { firstSeenAt: { gte: startUtc, lte: endUtc } },
        include: { camera: true },
      });

      const lines = [
        `"Lovosis Detection — Daily Report"`,
        `"Date:","${dateStr}"`,
        `"Generated At:","${new Date().toISOString()}"`,
        `""`,
        `"Summary Metrics"`,
        `"Total People Detected",${tracks.filter((t) => t.class === "PERSON").length}`,
        `"Male",${tracks.filter((t) => t.gender === "MALE").length}`,
        `"Female",${tracks.filter((t) => t.gender === "FEMALE").length}`,
        `"Emirati (Traditional Attire)",${tracks.filter((t) => t.nationality === "EMIRATI").length}`,
        `"Non-Emirati (Regular Attire)",${tracks.filter((t) => t.nationality === "NON_EMIRATI").length}`,
        `"Dogs",${tracks.filter((t) => t.class === "DOG").length}`,
        `"Cats",${tracks.filter((t) => t.class === "CAT").length}`,
        `""`,
        `"Track Details"`,
        `"Track ID","Camera","Class","Gender","Attire/Nationality","First Seen (Dubai Local)","Dwell Seconds"`,
        ...tracks.map((t) => {
          const dLocal = new Date(t.firstSeenAt.getTime() + DUBAI_OFFSET_HOURS * 3600 * 1000).toISOString().replace("T", " ").replace("Z", "");
          return `"${t.id}","${t.camera.code} - ${t.camera.name}","${t.class}","${t.gender}","${t.nationality}","${dLocal}",${t.dwellSeconds}`;
        }),
      ];

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="lovosis-daily-report-${dateStr}.csv"`);
      return res.send(lines.join("\r\n"));
    }

    res.status(400).json({ success: false, message: "Unsupported report type for export" });
  } catch (error) {
    console.error("[reports] export error:", error);
    res.status(500).json({ success: false, message: "Failed to export report" });
  }
}
