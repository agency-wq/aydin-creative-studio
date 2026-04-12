import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacchetti Node-only che non devono essere bundlati dal webpack client.
  // Remotion, Prisma, BullMQ, ioredis girano solo server-side.
  serverExternalPackages: [
    "@remotion/renderer",
    "@remotion/bundler",
    "@prisma/client",
    "bullmq",
    "ioredis",
  ],

  // Disabilita i source map in produzione per ridurre la build size.
  productionBrowserSourceMaps: false,

  // Immagini esterne (avatar thumbnails, Pexels, HeyGen).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "files.heygen.ai" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "videos.pexels.com" },
    ],
  },

  // Timeout API routes per operazioni long-running (script gen, AI Director).
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
