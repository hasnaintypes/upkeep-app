import type { NextConfig } from "next";
import nextra from "nextra";

// Docs at /docs are served from src/content -- see src/app/docs/ for the
// route shell and mdx-components.tsx for content styling. No
// nextra-theme-docs: the docs shell is hand-built from this app's own
// shadcn components (src/features/docs) so it matches the app's theme
// instead of looking like a generic Nextra site.
//
const withNextra = nextra({
  contentDirBasePath: "/docs",
  defaultShowCopyCode: true,
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  // This repo already maintains its own AGENTS.md/CLAUDE.md by hand --
  // don't let `next dev` auto-append its own AI-agent notice block to it.
  agentRules: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default withNextra(nextConfig);
