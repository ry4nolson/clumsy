import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  routeDiscovery: { mode: "initial" },
  async prerender() {
    return ["/", "/changelog"];
  },
} satisfies Config;
