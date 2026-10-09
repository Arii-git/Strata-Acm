import { redirect } from "next/navigation";

/** /app/cases/{id} is an alias: the case file lives at /app/incidents/{id}. Redirect only. */
export default async function CaseRedirect({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? `?tab=${encodeURIComponent(sp.tab)}` : "";
  redirect(`/app/incidents/${encodeURIComponent(decodeURIComponent(id))}${tab}`);
}
