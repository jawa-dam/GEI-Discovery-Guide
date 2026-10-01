import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.paypal.com https://*.paypal.com https://www.paypalobjects.com",
  "connect-src 'self' https://*.paypal.com https://www.paypalobjects.com",
  "frame-src https://*.paypal.com https://www.paypalobjects.com",
  "img-src 'self' data: blob: https://*.paypal.com https://www.paypalobjects.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self' https://*.paypal.com",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }
        ]
      },
      {
        source: "/guide/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }]
      }
    ];
  }
};

export default nextConfig;
