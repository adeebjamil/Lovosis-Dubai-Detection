// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into the real app.
// Reference: frontend/src/components/ui/StatCard.tsx  +  SalesChartCard.tsx
// Volt "Customers / Revenue" stat card and the cyan hero "Sales Value" chart card.
"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faAngleUp, faAngleDown, faGlobeEurope } from "@fortawesome/free-solid-svg-icons";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

/* ---------------- StatCard ---------------- */
export interface StatCardProps {
  title: string;
  value: string;
  icon: IconDefinition;
  period?: string;          // "Feb 1 - Apr 1"
  trend?: number;           // 18.2 or -3.1
  iconTone?: "default" | "tertiary" | "secondary" | "danger";
}

export function StatCard({ title, value, icon, period, trend, iconTone = "default" }: StatCardProps) {
  const up = (trend ?? 0) >= 0;
  return (
    <div className="card">
      <div className="card-body flex items-center gap-6">
        <div className={`icon-shape ${iconTone !== "default" ? `icon-shape-${iconTone}` : ""}`}>
          <FontAwesomeIcon icon={icon} />
        </div>
        <div className="min-w-0">
          <h5 className="card-title">{title}</h5>
          <div className="metric">{value}</div>
          {period && (
            <div className="text-muted mt-1 text-xs">
              {period}, <FontAwesomeIcon icon={faGlobeEurope} className="mx-0.5" /> WorldWide
            </div>
          )}
          {trend !== undefined && (
            <div className="mt-1 text-xs">
              <span className={up ? "trend-up" : "trend-down"}>
                <FontAwesomeIcon icon={up ? faAngleUp : faAngleDown} /> {Math.abs(trend)}%
              </span>{" "}
              <span className="text-muted text-xs">Since last month</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- SalesChartCard (hero) ---------------- */
type Point = { label: string; value: number };

export function SalesChartCard({
  title, value, change, data,
}: { title: string; value: string; change: number; data: Record<"month" | "week", Point[]> }) {
  const [range, setRange] = useState<"month" | "week">("week");
  const up = change >= 0;

  return (
    <div className="card card-hero">
      <div className="flex items-start justify-between p-6 pb-2">
        <div>
          <h5 className="text-lg font-normal text-primary">{title}</h5>
          <div className="metric">{value}</div>
          <div className="mt-1 text-sm">
            <span className="text-gray-700">Yesterday</span>{" "}
            <span className={up ? "trend-up" : "trend-down"}>
              <FontAwesomeIcon icon={up ? faAngleUp : faAngleDown} /> {Math.abs(change)}%
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {(["month", "week"] as const).map((r) => (
            <button key={r} id={`chart-range-${r}`} onClick={() => setRange(r)}
              className={`btn btn-sm ${range === r ? "btn-primary" : "btn-secondary"}`}>
              {r === "month" ? "Month" : "Week"}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px] px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data[range]} margin={{ top: 20, right: 24, left: 24, bottom: 0 }}>
            <CartesianGrid vertical horizontal={false} stroke="rgba(23,165,206,.25)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false}
              tick={{ fill: "#262B40", fontSize: 12, fontWeight: 600 }} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #EAEDF2", boxShadow: "0 .5rem 1rem rgba(46,54,80,.15)" }} />
            <Area type="monotone" dataKey="value" stroke="#17A5CE" strokeWidth={2}
              fill="#17A5CE" fillOpacity={0.15}
              dot={{ r: 4, fill: "#17A5CE", strokeWidth: 0 }} activeDot={{ r: 6 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
