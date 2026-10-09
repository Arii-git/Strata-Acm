import { StrataLoader } from "@/components/ui/Loader";

/** Route-level loading state for every console page: the STRATA loop over the content area. */
export default function ConsoleLoading() {
  return <StrataLoader size="lg" label="Loading the page" fullscreen />;
}
