import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("changelog", "routes/changelog.tsx"),
  route("checkout", "routes/checkout.ts"),
  route("thanks", "routes/thanks.tsx"),
  route("install/:platform?", "routes/install.tsx"),
] satisfies RouteConfig;
