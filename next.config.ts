import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' scripts: the pre-paint theme script; styles: Tailwind runtime vars.
  // Dev-only 'unsafe-eval': React dev tooling (stack reconstruction) needs eval();
  // React NEVER uses eval in production, so prod CSP stays strict.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:", // shadowing playback uses object URLs
  "connect-src 'self'", // AI calls are server-side; the browser only talks to itself
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  // Clickjacking / MIME-sniffing / referrer hygiene. HSTS omitted on purpose:
  // the app serves plain HTTP on loopback only.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // native/loader-heavy parsers must stay external to the server bundle —
  // bundling breaks tesseract's worker+wasm resolution and pdf-parse's
  // test-file hack
  serverExternalPackages: ["better-sqlite3", "tesseract.js", "pdf-parse", "mammoth"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
