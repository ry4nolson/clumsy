import { useRouteLoaderData } from "react-router";

import type { loader } from "~/root";

export function useVersion() {
  return useRouteLoaderData<typeof loader>("root")?.version ?? "";
}
