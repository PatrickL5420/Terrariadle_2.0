/**
 * Dev tools (the Dev panel, /api/dev and /ui) are on under `npm run dev` and on Vercel preview
 * deployments. Set at build time in vite.config.ts, so production builds drop the tools entirely.
 */
export const DEV_TOOLS: boolean = __DEV_TOOLS__;
