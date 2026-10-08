"use client";

import { useBrandStore, type BrandLogoConfig, type PresetLogoId } from "@/store/brand";

interface BrandMarkProps {
  size?: number;
  className?: string;
  variant?: "light" | "dark";
  title?: string;
  config?: BrandLogoConfig; // optional override (useful for real-time previews)
}

export default function BrandLogo({
  size = 28,
  className = "",
  variant = "light",
  title = "Lovosis Detection",
  config,
}: BrandMarkProps) {
  const storeConfig = useBrandStore((s) => s.config);
  const activeConfig = config ?? storeConfig;

  const ink = variant === "dark" ? "#FFFFFF" : "#262B40";
  const accent = "#61DAFB"; // Volt Cyan
  const emerald = "#05A677"; // Volt Emerald

  // Custom uploaded image or data URL
  if (activeConfig.type === "custom" && activeConfig.customDataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-transparent ${className}`}
        title={title}
        role="img"
        aria-label={title}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeConfig.customDataUrl}
          alt={title}
          className="w-full h-full object-contain bg-transparent"
        />
      </div>
    );
  }

  const presetId = activeConfig.presetId ?? "cyber-iris";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={`shrink-0 bg-transparent ${className}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderPresetSvg(presetId, ink, accent, emerald)}
    </svg>
  );
}

export function renderPresetSvg(
  presetId: PresetLogoId,
  ink: string,
  accent: string,
  emerald: string,
) {
  switch (presetId) {
    case "falcon-vision":
      return (
        <g>
          {/* Outer falcon visor scan arc */}
          <path
            d="M6 32 C16 15, 48 15, 58 32 C48 49, 16 49, 6 32 Z"
            stroke={ink}
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          {/* Inner precision contour */}
          <path
            d="M14 32 C22 21, 42 21, 50 32 C42 43, 22 43, 14 32 Z"
            stroke={accent}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {/* Diamond aperture facet */}
          <polygon
            points="32,20 42,32 32,44 22,32"
            fill="none"
            stroke={emerald}
            strokeWidth="2"
          />
          {/* Focal pupil */}
          <circle cx="32" cy="32" r="5" fill={accent} />
          <circle cx="32" cy="32" r="2" fill="#FFFFFF" />

          {/* Crosshairs */}
          <line x1="32" y1="7" x2="32" y2="13" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="32" y1="51" x2="32" y2="57" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="2" y1="32" x2="6" y2="32" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="58" y1="32" x2="62" y2="32" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );

    case "hexaguard":
      return (
        <g>
          {/* Precision Hexagon Frame */}
          <polygon
            points="32,5 55,18 55,46 32,59 9,46 9,18"
            stroke={ink}
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          {/* Concentric radar dash ring */}
          <circle
            cx="32"
            cy="32"
            r="17"
            stroke={accent}
            strokeWidth="2"
            strokeDasharray="4 2.5"
          />
          {/* Optical lens ring */}
          <circle cx="32" cy="32" r="9.5" stroke={ink} strokeWidth="2.5" />
          {/* Central sensor core */}
          <circle cx="32" cy="32" r="5" fill={emerald} />
          <circle cx="32" cy="32" r="2" fill="#FFFFFF" />

          {/* Corner node indicators */}
          <circle cx="32" cy="5" r="2.5" fill={accent} />
          <circle cx="55" cy="46" r="2.5" fill={accent} />
          <circle cx="9" cy="46" r="2.5" fill={accent} />
        </g>
      );

    case "apex-lens":
      return (
        <g>
          {/* Outer circular bezel */}
          <circle cx="32" cy="32" r="24" stroke={ink} strokeWidth="3" />
          {/* Interlocking continuous shutter arcs */}
          <path
            d="M32 8 A 24 24 0 0 1 53 44 A 17 17 0 0 1 20 48 A 17 17 0 0 1 32 8"
            stroke={accent}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M32 56 A 24 24 0 0 1 11 20 A 17 17 0 0 1 44 16 A 17 17 0 0 1 32 56"
            stroke={emerald}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* Central pupil */}
          <circle cx="32" cy="32" r="7.5" stroke={ink} strokeWidth="2" />
          <circle cx="32" cy="32" r="4" fill={accent} />
          <circle cx="32" cy="32" r="1.5" fill="#FFFFFF" />
        </g>
      );

    case "cyber-iris":
    default:
      return (
        <g>
          {/* 4 Optical Detection Brackets */}
          <path
            d="M6 18v-8a4 4 0 0 1 4-4h8 M46 6h8a4 4 0 0 1 4 4v8 M58 46v8a4 4 0 0 1-4 4h-8 M18 58h-8a4 4 0 0 1-4-4v-8"
            stroke={ink}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Outer optical dash ring */}
          <circle
            cx="32"
            cy="32"
            r="20"
            stroke={ink}
            strokeWidth="2.4"
            strokeDasharray="3.5 3.5"
            opacity="0.9"
          />
          {/* Inner precision aperture ring */}
          <circle cx="32" cy="32" r="14.5" stroke={accent} strokeWidth="2" />

          {/* 6 Precision geometric aperture blades */}
          <line x1="32" y1="17.5" x2="38.5" y2="26.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="44.5" y1="24.5" x2="40.5" y2="34.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="44.5" y1="39.5" x2="34.5" y2="43.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="32" y1="46.5" x2="25.5" y2="37.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="19.5" y1="39.5" x2="23.5" y2="29.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="19.5" y1="24.5" x2="29.5" y2="20.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />

          {/* Central neural sensor pupil */}
          <circle cx="32" cy="32" r="6" fill={accent} />
          <circle cx="32" cy="32" r="2.5" fill="#FFFFFF" />
          <circle cx="32" cy="32" r="1" fill={emerald} />
        </g>
      );
  }
}
