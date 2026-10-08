"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDay,
  faCalendarWeek,
  faDownload,
  faPrint,
  faRotateRight,
  faUsers,
  faMars,
  faPaw,
  faPassport,
  faCircleExclamation,
  faChartLine,
} from "@fortawesome/free-solid-svg-icons";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, apiErrorMessage } from "@/lib/api";
import { StatCard } from "@/components/ui/Cards";

interface DailySummary {
  people: number;
  male: number;
  female: number;
  unknownGender: number;
  emirati: number;
  nonEmirati: number;
  unknownNationality: number;
  dogs: number;
  cats: number;
  totalPets: number;
  peakHour: string;
  peakPeopleCount: number;
}

interface HourlyPoint {
  hour: string;
  people: number;
  male: number;
  female: number;
  emirati: number;
  nonEmirati: number;
  pets: number;
}

interface CameraReportItem {
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
}

interface DailyReportData {
  date: string;
  summary: DailySummary;
  hourly: HourlyPoint[];
  byCamera: CameraReportItem[];
}

interface WeeklyDayPoint {
  date: string;
  dayName: string;
  people: number;
  male: number;
  female: number;
  emirati: number;
  nonEmirati: number;
  pets: number;
}

interface WeeklyReportData {
  periodStart: string;
  periodEnd: string;
  summary: {
    people: number;
    male: number;
    female: number;
    emirati: number;
    nonEmirati: number;
    dogs: number;
    cats: number;
    totalPets: number;
    dailyAverage: number;
  };
  daily: WeeklyDayPoint[];
  camerasCount: number;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : "0%");

export default function ReportsView() {
  const [reportType, setReportType] = useState<"daily" | "weekly">("daily");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailyData, setDailyData] = useState<DailyReportData | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Reports & Analytics · Lovosis Detection";
    let active = true;
    const load = async () => {
      try {
        if (reportType === "daily") {
          const res = await api.get<{ data: DailyReportData }>(`/reports/daily?date=${selectedDate}`);
          if (!active) return;
          setDailyData(res.data.data);
        } else {
          const res = await api.get<{ data: WeeklyReportData }>(`/reports/weekly?endDate=${selectedDate}`);
          if (!active) return;
          setWeeklyData(res.data.data);
        }
      } catch (e) {
        if (active) setError(apiErrorMessage(e, "Failed to load report data"));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [reportType, selectedDate]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      if (reportType === "daily") {
        const res = await api.get<{ data: DailyReportData }>(`/reports/daily?date=${selectedDate}`);
        setDailyData(res.data.data);
      } else {
        const res = await api.get<{ data: WeeklyReportData }>(`/reports/weekly?endDate=${selectedDate}`);
        setWeeklyData(res.data.data);
      }
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to load report data"));
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/reports/export?type=${reportType}&date=${selectedDate}`, "_blank");
  };

  const handlePrint = () => {
    window.print();
  };

  const dSummary = dailyData?.summary;
  const wSummary = weeklyData?.summary;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Footfall & Demographics Reports</h1>
          <p className="text-muted text-sm">
            Daily and weekly analytics on footfall, gender distribution, UAE traditional attire vs regular wear, and pets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button id="btn-print-report" className="btn btn-outline-gray btn-sm" onClick={handlePrint}>
            <FontAwesomeIcon icon={faPrint} /> Print / Save PDF
          </button>
          <button id="btn-export-report-csv" className="btn btn-primary btn-sm" onClick={handleExportCsv}>
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-danger flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleExclamation} /> {error}
        </div>
      )}

      {/* Report Controls Bar */}
      <div className="card">
        <div className="card-body flex flex-wrap items-center justify-between gap-4">
          <div className="btn-group">
            <button
              id="tab-daily-report"
              className={`btn btn-sm ${reportType === "daily" ? "btn-primary" : "btn-outline-gray"}`}
              onClick={() => setReportType("daily")}
            >
              <FontAwesomeIcon icon={faCalendarDay} /> Daily Report
            </button>
            <button
              id="tab-weekly-report"
              className={`btn btn-sm ${reportType === "weekly" ? "btn-primary" : "btn-outline-gray"}`}
              onClick={() => setReportType("weekly")}
            >
              <FontAwesomeIcon icon={faCalendarWeek} /> Weekly Report
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-700">Select Date:</label>
            <input
              id="report-date-picker"
              type="date"
              className="form-control text-sm"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button id="btn-reload-report" className="btn btn-outline-gray btn-sm" onClick={handleRefresh}>
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
          </div>
        </div>
      </div>

      {/* Executive Highlights */}
      {reportType === "daily" && dSummary && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            id="stat-report-people"
            title="Total People"
            value={fmt(dSummary.people)}
            icon={faUsers}
            meta={`Peak hour: ${dSummary.peakHour} (${fmt(dSummary.peakPeopleCount)} people)`}
            loading={loading}
          />
          <StatCard
            id="stat-report-gender"
            title="Gender Distribution"
            value={`${pct(dSummary.male, dSummary.people)} ♂ / ${pct(dSummary.female, dSummary.people)} ♀`}
            icon={faMars}
            iconTone="secondary"
            meta={`${fmt(dSummary.male)} Male · ${fmt(dSummary.female)} Female`}
            loading={loading}
          />
          <StatCard
            id="stat-report-attire"
            title="UAE Traditional Attire"
            value={pct(dSummary.emirati, dSummary.people)}
            icon={faPassport}
            iconTone="secondary"
            meta={`${fmt(dSummary.emirati)} Kandura / Abaya · ${fmt(dSummary.nonEmirati)} Regular`}
            loading={loading}
          />
          <StatCard
            id="stat-report-pets"
            title="Pets Detected"
            value={fmt(dSummary.totalPets)}
            icon={faPaw}
            iconTone="tertiary"
            meta={`${fmt(dSummary.dogs)} Dogs · ${fmt(dSummary.cats)} Cats`}
            loading={loading}
          />
        </div>
      )}

      {reportType === "weekly" && wSummary && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            id="stat-weekly-people"
            title="Weekly Total Footfall"
            value={fmt(wSummary.people)}
            icon={faUsers}
            meta={`Daily average: ${fmt(wSummary.dailyAverage)} people/day`}
            loading={loading}
          />
          <StatCard
            id="stat-weekly-gender"
            title="Gender Ratio"
            value={`${pct(wSummary.male, wSummary.people)} ♂ / ${pct(wSummary.female, wSummary.people)} ♀`}
            icon={faMars}
            iconTone="secondary"
            meta={`${fmt(wSummary.male)} Male · ${fmt(wSummary.female)} Female`}
            loading={loading}
          />
          <StatCard
            id="stat-weekly-attire"
            title="Traditional Attire Ratio"
            value={pct(wSummary.emirati, wSummary.people)}
            icon={faPassport}
            iconTone="secondary"
            meta={`${fmt(wSummary.emirati)} Emirati Traditional · ${fmt(wSummary.nonEmirati)} Regular`}
            loading={loading}
          />
          <StatCard
            id="stat-weekly-pets"
            title="Total Pets"
            value={fmt(wSummary.totalPets)}
            icon={faPaw}
            iconTone="tertiary"
            meta={`${fmt(wSummary.dogs)} Dogs · ${fmt(wSummary.cats)} Cats`}
            loading={loading}
          />
        </div>
      )}

      {/* Chart Section */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h5 className="card-title flex items-center gap-2">
            <FontAwesomeIcon icon={faChartLine} />
            {reportType === "daily" ? `Hourly Footfall Trend (${selectedDate})` : `Daily Footfall Trend (7 Days)`}
          </h5>
          <span className="badge badge-gray">Realtime Analytics</span>
        </div>
        <div className="card-body">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {reportType === "daily" ? (
                <AreaChart data={dailyData?.hourly ?? []} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPeople" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#262b40" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#262b40" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorEmirati" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#05a677" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#05a677" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#66799e" }} stroke="#cbd5e1" />
                  <YAxis tick={{ fontSize: 11, fill: "#66799e" }} stroke="#cbd5e1" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#262b40", borderRadius: 8, color: "#fff", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="people" name="Total People" stroke="#262b40" strokeWidth={2} fillOpacity={1} fill="url(#colorPeople)" />
                  <Area type="monotone" dataKey="emirati" name="🇦🇪 Emirati (Traditional)" stroke="#05a677" strokeWidth={2} fillOpacity={1} fill="url(#colorEmirati)" />
                </AreaChart>
              ) : (
                <AreaChart data={weeklyData?.daily ?? []} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorWeekPeople" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#262b40" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#262b40" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="dayName" tick={{ fontSize: 11, fill: "#66799e" }} stroke="#cbd5e1" />
                  <YAxis tick={{ fontSize: 11, fill: "#66799e" }} stroke="#cbd5e1" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#262b40", borderRadius: 8, color: "#fff", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="people" name="Total People" stroke="#262b40" strokeWidth={2} fillOpacity={1} fill="url(#colorWeekPeople)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Breakdown Tables */}
      {reportType === "daily" && dailyData && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Camera Breakdown */}
          <div className="card overflow-hidden">
            <div className="card-header">
              <h5 className="card-title">Footfall by Camera Location</h5>
            </div>
            <div className="overflow-x-auto">
              <table className="table-volt">
                <thead>
                  <tr>
                    <th>Camera</th>
                    <th>People</th>
                    <th>Gender (♂/♀)</th>
                    <th>Traditional</th>
                    <th>Pets</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.byCamera.map((c) => (
                    <tr key={c.code}>
                      <td>
                        <span className="font-semibold text-primary">{c.code}</span>
                        <div className="text-xs text-gray-600">{c.name}</div>
                      </td>
                      <td className="font-bold text-gray-900">{fmt(c.people)}</td>
                      <td className="text-xs text-gray-700">
                        {fmt(c.male)} / {fmt(c.female)}
                      </td>
                      <td>
                        <span className="badge badge-success text-xs">
                          {pct(c.emirati, c.people)} ({fmt(c.emirati)})
                        </span>
                      </td>
                      <td className="text-xs text-gray-700">
                        {fmt(c.dogs + c.cats)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Peak Hours Table */}
          <div className="card overflow-hidden">
            <div className="card-header">
              <h5 className="card-title">Busiest Hours Breakdown</h5>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="table-volt">
                <thead>
                  <tr>
                    <th>Hour (Dubai)</th>
                    <th>People</th>
                    <th>Male</th>
                    <th>Female</th>
                    <th>Traditional Attire</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.hourly
                    .filter((h) => h.people > 0)
                    .sort((a, b) => b.people - a.people)
                    .slice(0, 10)
                    .map((h) => (
                      <tr key={h.hour}>
                        <td className="font-medium text-gray-900">{h.hour}</td>
                        <td className="font-bold text-primary">{fmt(h.people)}</td>
                        <td className="text-xs text-gray-700">{fmt(h.male)}</td>
                        <td className="text-xs text-gray-700">{fmt(h.female)}</td>
                        <td>
                          <span className="badge badge-success text-xs">
                            {fmt(h.emirati)} ({pct(h.emirati, h.people)})
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {reportType === "weekly" && weeklyData && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h5 className="card-title">7-Day Weekly Breakdown Table</h5>
          </div>
          <div className="overflow-x-auto">
            <table className="table-volt">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Total People</th>
                  <th>Male</th>
                  <th>Female</th>
                  <th>🇦🇪 Emirati (Traditional)</th>
                  <th>Non-Emirati (Regular)</th>
                  <th>Pets (Dogs/Cats)</th>
                </tr>
              </thead>
              <tbody>
                {weeklyData.daily.map((d) => (
                  <tr key={d.date}>
                    <td className="font-medium text-gray-900">{d.date}</td>
                    <td className="font-semibold text-primary">{d.dayName}</td>
                    <td className="font-bold text-gray-900">{fmt(d.people)}</td>
                    <td className="text-xs text-gray-700">{fmt(d.male)}</td>
                    <td className="text-xs text-gray-700">{fmt(d.female)}</td>
                    <td>
                      <span className="badge badge-success text-xs">
                        {fmt(d.emirati)} ({pct(d.emirati, d.people)})
                      </span>
                    </td>
                    <td className="text-xs text-gray-700">
                      {fmt(d.nonEmirati)} ({pct(d.nonEmirati, d.people)})
                    </td>
                    <td className="text-xs text-gray-700">{fmt(d.pets)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
