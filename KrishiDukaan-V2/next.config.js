/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    workerThreads: false,
    cpus: 1
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // www → apex, permanently.
  //
  // Both https://www.krishidukan.com/ and http://www.krishidukan.com/ appear in
  // Search Console's "Not found (404)" report: the hostname resolves but nothing
  // serves it, so every inbound link or citation using www is lost and the
  // domain's authority is split across two hostnames. The canonical origin is
  // the apex (app/layout.tsx metadataBase, app/sitemap.ts, app/robots.ts all
  // agree on it), so this makes the server agree too.
  //
  // permanent:true → 308, which preserves the method and is the correct
  // permanent signal for consolidating a hostname.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.krishidukan.com" }],
        destination: "https://krishidukan.com/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" }, // Allow all origins (standard for APIs serving mobile clients)
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Client" },
        ]
      }
    ];
  }
};

module.exports = nextConfig;
