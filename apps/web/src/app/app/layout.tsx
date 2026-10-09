"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/shell";
import { StrataLoader } from "@/components/ui/Loader";
import { isSigningOut, useAuth } from "@/lib/auth";
import { PersonaProvider } from "@/lib/persona";
import { useTheme } from "@/lib/theme";
import { ViewModeProvider } from "@/lib/viewmode";

/**
 * Auth gate for the console. AuthProvider + ThemeProvider live in the root layout.
 * Loading → loader; signed out → back to the landing sign-in with ?next=; signed in → the shell.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || user || isSigningOut()) return;
    const here = `${pathname || "/app"}${typeof window !== "undefined" ? window.location.search : ""}`;
    router.replace(`/?next=${encodeURIComponent(here)}`);
  }, [loading, user, pathname, router]);

  if (loading) return <StrataLoader fullscreen label="Signing you in" />;
  if (!user) return <StrataLoader fullscreen label={isSigningOut() ? "Signing you out" : "Taking you to sign in"} />;

  return (
    <PersonaProvider>
      <ViewModeProvider>
        <ThemeFromPrefs />
        <AppShell>{children}</AppShell>
      </ViewModeProvider>
    </PersonaProvider>
  );
}

/** Apply the saved appearance once per signed-in user (later changes are made in Settings). */
function ThemeFromPrefs() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const pref = user?.prefs?.theme;
    if (!user || applied.current === user.id) return;
    applied.current = user.id;
    if (pref && pref !== theme) setTheme(pref);
  }, [user, theme, setTheme]);
  return null;
}
