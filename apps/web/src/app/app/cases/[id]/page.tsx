import { redirect } from "next/navigation";

/** /app/cases/{id} is an alias: the one canonical case view lives at /app/incidents/{id}. Keeps ?stage= (and legacy ?tab=). */
export default async function CaseRedirect({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (typeof sp.stage === "string") q.set("stage", sp.stage);
  else if (typeof sp.tab === "string") q.set("tab", sp.tab);
  const s = q.toString();
  redirect(`/app/incidents/${encodeURIComponent(decodeURIComponent(id))}${s ? `?${s}` : ""}`);
}
