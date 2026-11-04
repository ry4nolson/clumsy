import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import netlifyReactRouter from "@netlify/vite-plugin-react-router";
import netlify from "@netlify/vite-plugin";

export default defineConfig({
  define: {
    __SITE_URL__: JSON.stringify(process.env.URL ?? "http://localhost:5173"),
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
  plugins: [reactRouter(), netlifyReactRouter(), netlify({ edgeFunctions: { enabled: false } })],
});
