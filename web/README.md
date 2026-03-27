# Web

SvelteKit frontend for the onchain app template, built with [SvelteKit 5](https://svelte.dev/), [Tailwind CSS 4](https://tailwindcss.com/), and configured for both traditional hosting and decentralized deployment (IPFS).

## Project Structure

```
web/
├── src/
│   ├── lib/                  # Shared components and utilities
│   │   ├── core/             # Core utilities (notifications, service worker)
│   │   └── deployments.ts    # Auto-generated contract deployments
│   ├── routes/               # SvelteKit routes
│   │   ├── contracts/        # Contract interaction pages
│   │   ├── demo/             # Demo pages
│   │   ├── explorer/         # Explorer pages
│   │   └── transactions/     # Transaction pages
│   └── service-worker/       # PWA service worker
├── static/                   # Static assets (icons, PWA assets)
├── svelte.config.js          # SvelteKit configuration
└── vite.config.ts            # Vite configuration
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)

Install dependencies from the monorepo root:

```bash
pnpm i
```

## Commands

All commands below are run from the `web/` directory.

### Development

```bash
pnpm dev                  # Start dev server (with host access)
```

### Build

```bash
pnpm build                # Production build (static output to build/)
pnpm preview              # Preview the production build locally
```

### Test

```bash
pnpm test                 # Run unit tests (vitest)
pnpm test:unit            # Run unit tests in watch mode
```

### Type Checking

```bash
pnpm check                # Run svelte-check
pnpm check:watch          # Run svelte-check in watch mode
```

### Lint & Format

```bash
pnpm format               # Format with prettier
pnpm format:check         # Check formatting
```

### PWA Icons

```bash
pnpm generate-pwa-icons   # Regenerate PWA icons from static/icon.svg
```

### IPFS Preview

```bash
pnpm serve                # Serve the build via an IPFS gateway emulator on port 8080
```

## Configuration

### Web Config

App metadata is defined in `src/web-config.json`:

```json
{
  "name": "Template Website",
  "title": "Template Website",
  "description": "A template to build website",
  "canonicalURL": "https://localhost",
  "themeColor": "#000000"
}
```

This is used for PWA manifest generation (`pwag`) and can be referenced in components.

### Static Adapter & IPFS

The app uses `@sveltejs/adapter-static` with these settings for IPFS compatibility:

- **Relative paths** — `paths.relative: true` allows the app to work on any base path
- **SPA fallback** — `200.html` fallback for client-side routing
- **Single bundle** — `bundleStrategy: 'single'` reduces file count for IPFS gateways

### Service Worker

The service worker is manually registered (not via SvelteKit's built-in registration). The implementation is in `src/service-worker/`.

### Environment Variables

Environment variables are loaded via [ldenv](https://github.com/nicoth-in/ldenv) (configured in the `dev` and `build` scripts). Place variables in `.env.local` (gitignored).

## Contract Integration

Contract ABIs and deployment addresses are auto-generated into `src/lib/deployments.ts` by the contracts package via `rocketh-export`. Import them in your components:

```typescript
import { deployments } from "$lib/deployments";

const address = deployments.GreetingsRegistry.address;
const abi = deployments.GreetingsRegistry.abi;
```

The wallet connection is handled by `@etherplay/connect`.

## Deployment

### Vercel / Static Hosting

The build outputs static files to `build/`. Deploy this directory to any static hosting provider.

### IPFS

The app is configured for IPFS out of the box thanks to relative paths and SPA fallback. After building:

```bash
pnpm build
pnpm serve    # Test locally via IPFS gateway emulator
```

Then pin the `build/` directory to IPFS using your preferred pinning service.

## Monorepo Integration

This package is part of the [template-onchain-app](../) monorepo. For full-stack development workflows (including Hot Contract Replacement), see the root README.
