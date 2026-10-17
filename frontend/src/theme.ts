import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

// index.html runs the same lookup inline before the first paint, so the page
// never flashes the wrong colours. Keep the key and the colours below in step with it.
export const THEME_KEY = "theme";
const THEME_COLOR: Record<Theme, string> = { light: "#0a2342", dark: "#0b1220" };

const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

// The day/night choice the driver made, if any. Without one the page follows the OS.
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null; // storage blocked (private window, strict settings)
  }
}

export function systemTheme(): Theme {
  return darkQuery()?.matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => applyTheme(theme), [theme]);

  // Follow the OS switching between day and night until the driver picks one here.
  useEffect(() => {
    const query = darkQuery();
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => {
      if (!storedTheme()) setTheme(e.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // not remembered, but still switched for this visit
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
