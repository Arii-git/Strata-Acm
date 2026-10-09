import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotFlow } from "../_components/ForgotFlow";
import { CardSkeleton } from "../_components/shared";

export const metadata: Metadata = { title: "Reset password · STRATA" };

export default function Page() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ForgotFlow />
    </Suspense>
  );
}
