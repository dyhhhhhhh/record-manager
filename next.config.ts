import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "imusic.dk" },
      { protocol: "https", hostname: "*.imusic.dk" }
    ]
  }
};

export default nextConfig;
