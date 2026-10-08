import { create } from "zustand";
import { api } from "@/lib/api";

export type PresetLogoId = "cyber-iris" | "falcon-vision" | "hexaguard" | "apex-lens";

export interface BrandLogoConfig {
  type: "preset" | "custom";
  presetId: PresetLogoId;
  customDataUrl?: string | null;
}

export interface PresetOption {
  id: PresetLogoId;
  name: string;
  subtitle: string;
  description: string;
}

export const PRESET_LOGOS: PresetOption[] = [
  {
    id: "cyber-iris",
    name: "Cyber Iris (Flagship)",
    subtitle: "AI Surveillance Optic",
    description: "Multi-ring optical aperture with dynamic detection brackets and intelligent neural focal core.",
  },
  {
    id: "falcon-vision",
    name: "Falcon Vision Node",
    subtitle: "Sovereign UAE Intelligence",
    description: "Aerodynamic angular optical sensor with diamond crosshairs and precision visor arcs.",
  },
  {
    id: "hexaguard",
    name: "HexaGuard Pulse",
    subtitle: "Perimeter & Zone Security",
    description: "Hexagonal biometric shield with concentric detection radar rings and central camera node.",
  },
  {
    id: "apex-lens",
    name: "Apex Continuous Shutter",
    subtitle: "Minimalist Modern Tech",
    description: "Three interlocking continuous aperture blades forming an infinite optical shutter loop.",
  },
];

interface BrandState {
  config: BrandLogoConfig;
  previewConfig: BrandLogoConfig;
  loaded: boolean;
  setPreview: (cfg: Partial<BrandLogoConfig>) => void;
  resetPreview: () => void;
  saveConfig: () => Promise<void>;
  fetchConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: BrandLogoConfig = {
  type: "preset",
  presetId: "cyber-iris",
  customDataUrl: null,
};

const STORAGE_KEY = "lovosis_brand_logo_v1";

function loadFromStorage(): BrandLogoConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_CONFIG;
}

function saveToStorage(cfg: BrandLogoConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export const useBrandStore = create<BrandState>((set, get) => {
  const initial = loadFromStorage();

  return {
    config: initial,
    previewConfig: initial,
    loaded: false,

    setPreview: (cfg) => {
      set((state) => ({
        previewConfig: { ...state.previewConfig, ...cfg },
      }));
    },

    resetPreview: () => {
      set((state) => ({
        previewConfig: state.config,
      }));
    },

    saveConfig: async () => {
      const { previewConfig } = get();
      await api.put("/settings", { brandLogo: previewConfig });
      saveToStorage(previewConfig);
      set({ config: previewConfig });
    },

    fetchConfig: async () => {
      try {
        const res = await api.get<{ data: { brandLogo?: BrandLogoConfig } }>("/settings");
        const brandLogo = res.data.data.brandLogo;
        if (brandLogo && (brandLogo.type === "preset" || brandLogo.type === "custom")) {
          saveToStorage(brandLogo);
          set({
            config: brandLogo,
            previewConfig: brandLogo,
            loaded: true,
          });
        } else {
          set({ loaded: true });
        }
      } catch {
        set({ loaded: true });
      }
    },
  };
});
