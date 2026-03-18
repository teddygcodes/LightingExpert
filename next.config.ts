import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ['pdfjs-dist'],
  turbopack: {
    // zod-to-json-schema@3.25.x (inside @ai-sdk/ui-utils) imports "zod/v3"
    // which is only a Zod v4 subpath. Alias it to root Zod v3.
    resolveAlias: {
      'zod/v3': './node_modules/zod',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
};

export default nextConfig;
