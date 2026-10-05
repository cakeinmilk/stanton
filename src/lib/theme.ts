import type { CSSProperties } from 'react';

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.2;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Text colour that reads best on top of `hex`. */
export function onColor(hex: string): string {
  const l = luminance(hex);
  const vsWhite = 1.05 / (l + 0.05);
  const vsDark = (l + 0.05) / 0.06;
  // Slight bias towards white text, which reads as more "solid" on mid-tone colours.
  return vsWhite >= vsDark * 0.75 ? '#ffffff' : '#1d1a05';
}

/** Style that makes an element (with class "themed") take on a project's colour. */
export function projectStyle(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return { ['--project' as string]: color, ['--project-on' as string]: onColor(color) } as CSSProperties;
}
