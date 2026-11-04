# Clumsy website

Marketing site for Clumsy. Vite + React Router (SSR) on Netlify. See the Website section of [AGENTS.md](../AGENTS.md).

## Develop

```bash
cd web
pnpm install
pnpm dev
```

Open http://localhost:5173. Requires Node 22.22 or later.

## Build

```bash
pnpm build
```

## Deploy (Netlify)

Connect the repo in Netlify with **base directory `web`**, or from this folder:

```bash
npx netlify init
npx netlify deploy --prod
```

`netlify.toml` already sets the build command, publish directory, and the `/download` redirect.
