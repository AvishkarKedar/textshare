export type ThemeId = "dark" | "light" | "dracula" | "nord" | "monokai";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  swatch: string[]; // 5-color swatches for picker preview: [bg, panel, line, accent, ok]
}

export const THEMES: ThemeMeta[] = [
  {
    id: "dark",
    name: "Vanta Black",
    swatch: ["#000000", "#0b0b0b", "#1c1c1c", "#4c8dff", "#3ddc84"],
  },
  {
    id: "light",
    name: "Paper",
    swatch: ["#ffffff", "#f7f7f7", "#e5e5e5", "#0b62e0", "#16a34a"],
  },
  {
    id: "dracula",
    name: "Dracula",
    swatch: ["#282a36", "#1e1f29", "#44475a", "#bd93f9", "#50fa7b"],
  },
  {
    id: "nord",
    name: "Nord",
    swatch: ["#2e3440", "#434c5e", "#4c566a", "#88c0d0", "#a3be8c"],
  },
  {
    id: "monokai",
    name: "Monokai",
    swatch: ["#272822", "#171814", "#3e3d32", "#66d9ef", "#a6e22e"],
  },
];

export const PARTICIPANT_COLORS = [
  "#4c8dff",
  "#3ddc84",
  "#c792ea",
  "#e8b339",
  "#ff7849",
  "#2dd4bf",
  "#f472b6",
  "#a3e635",
];

export function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PARTICIPANT_COLORS[h % PARTICIPANT_COLORS.length];
}

export function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
