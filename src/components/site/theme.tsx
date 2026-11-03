"use client";

import React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "visionspeak:theme";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({
  theme: "dark",
  setTheme: () => undefined,
});

/**
 * Runs before paint on every navigation: reads the stored theme (falling back
 * to the OS preference) and sets `data-theme` on <html>. Inlined in the layout
 * as a blocking script so a light-theme visitor never sees a dark flash.
 */
export const themeInitScript = `(function(){try{var k="${STORAGE_KEY}";var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Sync React state with whatever the init script already chose. Reading the
  // attribute during render would desync server HTML from the first client
  // paint, so this one-shot post-hydration read is deliberate.
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration restore
    if (current === "light" || current === "dark") setThemeState(current);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/* ------------------------------------------------------------------ *
 * Chart palette
 *
 * Recharts takes colours as props rather than classes, so this is the one
 * place the theme is read in JavaScript. The values mirror globals.css: the
 * vivid dark set, and darker, higher-contrast equivalents for paper — a
 * #34d399 line on white is barely visible, #0f766e is not.
 * ------------------------------------------------------------------ */

export interface ChartTheme {
  grid: string;
  polarGrid: string;
  axis: string;
  cursor: string;
  tooltip: React.CSSProperties;
  /** A series that has been toggled off. */
  idle: string;
  /**
   * One entry per series hue. Charts map their own lines onto these, because
   * the same metric is not always the same colour across the product (the
   * dashboard trend draws confidence in cyan, the report radar in violet).
   */
  hue: { violet: string; cyan: string; emerald: string; amber: string; rose: string; blue: string };
}

const darkChart: ChartTheme = {
  grid: "rgba(255,255,255,0.05)",
  polarGrid: "rgba(255,255,255,0.09)",
  axis: "#c8b4c4",
  cursor: "rgba(255,255,255,0.16)",
  idle: "#49304f",
  hue: {
    violet: "#e8bfa8",
    cyan: "#f06b58",
    emerald: "#b84a3e",
    amber: "#c8b4c4",
    rose: "#e8bfa8",
    blue: "#f06b58",
  },
  tooltip: {
    background: "rgba(12,12,20,0.95)",
    border: "1px solid #49304f",
    borderRadius: 12,
    padding: "8px 10px",
    fontSize: 11,
    color: "#fbf8f5",
    boxShadow: "0 20px 40px -20px rgba(0,0,0,0.9)",
  },
};

const lightChart: ChartTheme = {
  grid: "rgba(33,21,43,0.08)",
  polarGrid: "rgba(33,21,43,0.12)",
  axis: "#49304f",
  cursor: "rgba(33,21,43,0.2)",
  idle: "#d4a896",
  hue: {
    violet: "#c94a38",
    cyan: "#8f6a60",
    emerald: "#b84a3e",
    amber: "#49304f",
    rose: "#8f6a60",
    blue: "#c94a38",
  },
  tooltip: {
    background: "rgba(255,255,255,0.98)",
    border: "1px solid #e8bfa8",
    borderRadius: 12,
    padding: "8px 10px",
    fontSize: 11,
    color: "#21152b",
    boxShadow: "0 18px 36px -22px rgba(73,48,79,0.35)",
  },
};

export function useChartTheme() {
  return useContext(ThemeContext).theme === "light" ? lightChart : darkChart;
}
