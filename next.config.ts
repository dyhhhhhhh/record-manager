import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "imusic.b-cdn.net" },
      { protocol: "https", hostname: "imusic-static.b-cdn.net" },
      { protocol: "https", hostname: "imusic.dk" },
      { protocol: "https", hostname: "*.imusic.dk" }
    ]
  }
};

export default nextConfig;
