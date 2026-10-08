import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { dubaiDateKey, dubaiDayStart } from "../lib/time";

import { getLiveStatsSummary, broadcastDetectorReset } from "../realtime/detector-bridge";
import { emitToAdmins } from "../realtime/io";

type Totals = {
  people: number;
  male: number;
  female: number;
  unknownGender: number;
  emirati: number;
  nonEmirati: number;
  unknownNationality: number;
  dogs: number;
  cats: number;
};

async function totalsBetween(from: Date, to: Date): Promise<Totals> {
  const rows = await prisma.minuteAggregate.groupBy({
    by: ["class", "gender", "nationality"],
    where: { bucket: { gte: from, lt: to } },
    _sum: { uniqueCount: true },
  });
  const t: Totals = {
    people: 0,
    male: 0,
    female: 0,
    unknownGender: 0,
    emirati: 0,
    nonEmirati: 0,
    unknownNationality: 0,
    dogs: 0,
    cats: 0,
  };

  if (rows.length > 0) {
    for (const r of rows) {
      const n = r._sum.uniqueCount ?? 0;
      if (r.class === "PERSON") {
        t.people += n;
        if (r.gender === "MALE") t.male += n;
        else if (r.gender === "FEMALE") t.female += n;
        else t.unknownGender += n;

        if (r.nationality === "EMIRATI") t.emirati += n;
        else if (r.nationality === "NON_EMIRATI") t.nonEmirati += n;
        else t.unknownNationality += n;
      } else if (r.class === "DOG") t.dogs += n;
      else if (r.class === "CAT") t.cats += n;
    }
  } else {
    const tracks = await prisma.track.findMany({
      where: { firstSeenAt: { gte: from, lt: to } },
      select: { class: true, gender: true, nationality: true },
    });
    for (const tr of tracks) {
      if (tr.class === "PERSON") {
        t.people++;
        if (tr.gender === "MALE") t.male++;
        else if (tr.gender === "FEMALE") t.female++;
        else t.unknownGender++;

        if (tr.nationality === "EMIRATI") t.emirati++;
        else if (tr.nationality === "NON_EMIRATI") t.nonEmirati++;
        else t.unknownNationality++;
      } else if (tr.class === "DOG") t.dogs++;
      else if (tr.class === "CAT") t.cats++;
    }
  }
  return t;
}

export async function summary(_req: Request, res: Response) {
  const now = new Date();
  const todayStart = dubaiDayStart(now);
  const yesterdayStart = dubaiDayStart(now, -1);
  const weekStart = dubaiDayStart(now, -6);

  let [today, yesterday, hourlyRows, dailyRows, camerasTotal, camerasOnline] = await Promise.all([
    totalsBetween(todayStart, now),
    totalsBetween(yesterdayStart, todayStart),
    prisma.$queryRaw<{ hour: number; people: number }[]>`
      SELECT EXTRACT(HOUR FROM ("bucket" + interval '4 hour'))::int AS hour,
             COALESCE(SUM("uniqueCount"), 0)::int AS people
      FROM "MinuteAggregate"
      WHERE "bucket" >= ${todayStart} AND "class" = 'PERSON'
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ day: string; people: number }[]>`
      SELECT to_char(("bucket" + interval '4 hour')::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM("uniqueCount"), 0)::int AS people
      FROM "MinuteAggregate"
      WHERE "bucket" >= ${weekStart} AND "class" = 'PERSON'
      GROUP BY 1 ORDER BY 1`,
    prisma.camera.count(),
    prisma.camera.count({ where: { status: "ONLINE" } }),
  ]);

  if (hourlyRows.length === 0) {
    hourlyRows = await prisma.$queryRaw<{ hour: number; people: number }[]>`
      SELECT EXTRACT(HOUR FROM ("firstSeenAt" + interval '4 hour'))::int AS hour,
             COUNT(*)::int AS people
      FROM "Track"
      WHERE "firstSeenAt" >= ${todayStart} AND "class" = 'PERSON'
      GROUP BY 1 ORDER BY 1`;
  }

  if (dailyRows.length === 0) {
    dailyRows = await prisma.$queryRaw<{ day: string; people: number }[]>`
      SELECT to_char(("firstSeenAt" + interval '4 hour')::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS people
      FROM "Track"
      WHERE "firstSeenAt" >= ${weekStart} AND "class" = 'PERSON'
      GROUP BY 1 ORDER BY 1`;
  }

  // Fill gaps so charts always have a full axis.
  const byHour = new Map(hourlyRows.map((r) => [r.hour, r.people]));
  const hourly = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}:00`,
    value: byHour.get(h) ?? 0,
  }));

  const byDay = new Map(dailyRows.map((r) => [r.day, r.people]));
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = dubaiDayStart(now, i - 6);
    const key = dubaiDateKey(d);
    const label = new Date(d.getTime() + 4 * 3600_000).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
    return { label, value: byDay.get(key) ?? 0 };
  });

  const peopleTrend =
    yesterday.people > 0 ? Math.round(((today.people - yesterday.people) / yesterday.people) * 1000) / 10 : null;

  const liveStats = getLiveStatsSummary();

  // Merge today counts with live memory
  const mergedToday = {
    ...today,
    people: Math.max(today.people, liveStats.today.persons),
    male: Math.max(today.male, liveStats.today.male),
    female: Math.max(today.female, liveStats.today.female),
    emirati: Math.max(today.emirati, liveStats.today.emirati),
    nonEmirati: Math.max(today.nonEmirati, liveStats.today.nonEmirati),
    dogs: Math.max(today.dogs, liveStats.today.dogs),
    cats: Math.max(today.cats, liveStats.today.cats),
  };

  res.json({
    success: true,
    data: {
      today: mergedToday,
      yesterday,
      live: liveStats.live,
      peopleTrend,
      weekTotal: daily.reduce((s, d) => s + d.value, 0),
      cameras: { total: camerasTotal, online: camerasOnline },
      hourly,
      daily,
      generatedAt: now.toISOString(),
    },
  });
}

export async function resetData(_req: Request, res: Response) {
  // Production safety guard: disabled in production unless explicitly permitted
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_RESET_IN_PROD !== "true") {
    return res.status(403).json({
      success: false,
      message: "Reset test data endpoint is disabled in production mode.",
    });
  }

  try {
    const tracks = await prisma.track.deleteMany();
    const countEvents = await prisma.countEvent.deleteMany();
    const aggregates = await prisma.minuteAggregate.deleteMany();
    const reports = await prisma.report.deleteMany();

    // Reset detector in-memory today counters and active tracks
    broadcastDetectorReset();

    // Notify connected browser dashboards to reset immediately
    emitToAdmins("analytics:reset", {
      timestamp: Date.now(),
      deletedTracks: tracks.count,
    });

    res.json({
      success: true,
      message: "All analytics, counts, and detection history have been reset successfully.",
      deleted: {
        tracks: tracks.count,
        countEvents: countEvents.count,
        minuteAggregates: aggregates.count,
        reports: reports.count,
      },
    });
  } catch (error) {
    console.error("[dashboard] reset error:", error);
    res.status(500).json({ success: false, error: "Failed to reset analytics data." });
  }
}
