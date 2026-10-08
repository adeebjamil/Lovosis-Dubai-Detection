"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faAngleDown, faAngleUp } from "@fortawesome/free-solid-svg-icons";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* ───────────────────────── StatCard ───────────────────────── */

export interface StatCardProps {
  id?: string;
  title: string;
  value: string | number;
  icon: IconDefinition;
  meta?: string;
  subtitle?: string;
  trend?: number; // percent, +/-
  trendSuffix?: string;
  iconTone?: "default" | "tertiary" | "secondary" | "danger" | "primary" | "info" | "success";
  loading?: boolean;
}

export function StatCard({
  id,
  title,
  value,
  icon,
  meta,
  subtitle,
  trend,
  trendSuffix = "vs yesterday",
  iconTone = "default",
  loading,
}: StatCardProps) {
  const up = (trend ?? 0) >= 0;
  const description = subtitle ?? meta;
  return (
    <div id={id} className="card">
      <div className="card-body flex items-center gap-5">
        <div className={`icon-shape shrink-0 ${iconTone !== "default" ? `icon-shape-${iconTone}` : ""}`}>
          <FontAwesomeIcon icon={icon} />
        </div>
        <div className="min-w-0">
          <h5 className="card-title">{title}</h5>
          {loading ? <div className="skeleton mt-1 h-8 w-24" /> : <div className="metric">{value}</div>}
          {description && <div className="text-muted mt-1 text-xs">{description}</div>}
          {trend !== undefined && (
            <div className="mt-1 text-xs">
              <span className={up ? "trend-up" : "trend-down"}>
                <FontAwesomeIcon icon={up ? faAngleUp : faAngleDown} /> {Math.abs(trend)}%
              </span>{" "}
              <span className="text-muted text-xs">{trendSuffix}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── HeroChartCard ─────────────────────── */

export type ChartPoint = { label: string; value: number };

export interface HeroChartCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  ranges?: Record<string, { label: string; data: ChartPoint[] }>;
  defaultRange?: string;
  loading?: boolean;
  className?: string;
}

export function HeroChartCard({
  title,
  value,
  subtitle,
  ranges = {},
  defaultRange,
  loading,
  className = "",
}: HeroChartCardProps) {
  const keys = Object.keys(ranges);
  const initialRange = defaultRange && ranges[defaultRange] ? defaultRange : keys[0];
  const [range, setRange] = useState<string | undefined>(initialRange);
  const activeKey = range && ranges[range] ? range : keys[0];
  const data = activeKey && ranges[activeKey] ? ranges[activeKey].data : [];

  return (
    <div className={`card card-hero ${className}`.trim()} id="hero-chart">
      <div className="flex flex-wrap items-start justify-between gap-3 p-6 pb-2">
        <div>
          <h5 className="text-lg font-normal text-primary">{title}</h5>
          {loading ? <div className="skeleton mt-1 h-9 w-28 !bg-white/50" /> : <div className="metric">{value}</div>}
          {subtitle && <div className="mt-1 text-sm text-gray-800">{subtitle}</div>}
        </div>
        <div className="flex gap-2">
          {keys.map((k) => (
            <button key={k} id={`chart-range-${k}`} onClick={() => setRange(k)}
              className={`btn btn-sm ${range === k ? "btn-primary" : "btn-secondary"}`}>
              {ranges[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px] px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 24, left: 24, bottom: 0 }}>
            <CartesianGrid vertical horizontal={false} stroke="rgba(23,165,206,.25)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd"
              tick={{ fill: "#262B40", fontSize: 12, fontWeight: 600 }} />
            <YAxis hide domain={[0, (max: number) => Math.max(5, Math.ceil(max * 1.2))]} />
            <Tooltip
              cursor={{ stroke: "#17A5CE", strokeOpacity: 0.4 }}
              contentStyle={{ borderRadius: 8, border: "1px solid #EAEDF2", boxShadow: "0 .5rem 1rem rgba(46,54,80,.15)" }}
              labelStyle={{ color: "#262B40", fontWeight: 700 }}
            />
            <Area type="monotone" dataKey="value" name="People" stroke="#17A5CE" strokeWidth={2}
              fill="#17A5CE" fillOpacity={0.15}
              dot={{ r: 3.5, fill: "#17A5CE", strokeWidth: 0 }} activeDot={{ r: 6 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
