import { AppShell } from "@/components/shell";
import { PersonaProvider } from "@/lib/persona";
import { ViewModeProvider } from "@/lib/viewmode";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersonaProvider>
      <ViewModeProvider>
        <AppShell>{children}</AppShell>
      </ViewModeProvider>
    </PersonaProvider>
  );
}
