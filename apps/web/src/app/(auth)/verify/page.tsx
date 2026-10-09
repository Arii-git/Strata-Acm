import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyFlow } from "../_components/VerifyFlow";
import { CardSkeleton } from "../_components/shared";

export const metadata: Metadata = { title: "Verify email · STRATA" };

export default function Page() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <VerifyFlow />
    </Suspense>
  );
}
