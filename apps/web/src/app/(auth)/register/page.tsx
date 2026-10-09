import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterFlow } from "../_components/RegisterFlow";
import { CardSkeleton } from "../_components/shared";

export const metadata: Metadata = { title: "Create an account · STRATA" };

export default function Page() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <RegisterFlow />
    </Suspense>
  );
}
