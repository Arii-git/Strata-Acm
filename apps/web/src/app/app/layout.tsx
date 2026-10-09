import { AppShell } from "@/components/shell";
import { PersonaProvider } from "@/lib/persona";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersonaProvider>
      <AppShell>{children}</AppShell>
    </PersonaProvider>
  );
}
