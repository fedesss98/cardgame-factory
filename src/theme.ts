export type GameTheme = {
  preset: "classic" | "minimal" | "storybook";
  background: string;
  surface: string;
  text: string;
  accent: string;
  font: "system-sans" | "system-serif" | "bundled";
  fontAssetId?: string;
  backgroundAssetId?: string;
};

export const themePresets: { label: string; theme: GameTheme }[] = [
  {
    label: "Parchment",
    theme: {
      preset: "classic",
      background: "#142b3b",
      surface: "#f7eed9",
      text: "#15232b",
      accent: "#d4dca0",
      font: "system-serif",
    },
  },
  {
    label: "Midnight",
    theme: {
      preset: "minimal",
      background: "#151925",
      surface: "#eef2fa",
      text: "#20283c",
      accent: "#a2c5ff",
      font: "system-sans",
    },
  },
  {
    label: "Storybook",
    theme: {
      preset: "storybook",
      background: "#20382c",
      surface: "#fff4dd",
      text: "#3c2d20",
      accent: "#e4bc76",
      font: "system-serif",
    },
  },
];

export function blankTheme(): GameTheme {
  const preset = themePresets.find((item) => item.theme.preset === "minimal");
  return structuredClone((preset ?? themePresets[0]).theme);
}

function rgb(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const color = rgb(hex);
  if (!color) return 0;
  const [r, g, b] = color.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function isLightColor(hex: string): boolean {
  return luminance(hex) > 0.5;
}

export function themeWarnings(theme: GameTheme): string[] {
  const warnings: string[] = [];
  const cardContrast = contrastRatio(theme.text, theme.surface);
  if (cardContrast < 4.5)
    warnings.push(
      `Card text and surface contrast is ${cardContrast.toFixed(1)}:1. Aim for at least 4.5:1.`,
    );
  const pageContrast = contrastRatio(theme.surface, theme.background);
  if (pageContrast < 3)
    warnings.push(
      `Surface text on the background is ${pageContrast.toFixed(1)}:1. Aim for at least 3:1.`,
    );
  const accentContrast = contrastRatio(theme.accent, theme.background);
  if (accentContrast < 3)
    warnings.push(
      `The accent is ${accentContrast.toFixed(1)}:1 against the background. Resource bars may be hard to see.`,
    );
  return warnings;
}
