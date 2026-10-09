/**
 * Server-safe theme constants (no "use client"): app/layout.tsx inlines THEME_SCRIPT in <head> so the first
 * paint already carries <html data-theme>. Keep the script tiny and dependency-free.
 */
export const THEME_KEY = "strata.theme";
export const THEME_QUERY = "(prefers-color-scheme: dark)";

export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia("${THEME_QUERY}").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;
