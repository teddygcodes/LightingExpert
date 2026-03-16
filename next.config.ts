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
};

export default nextConfig;
