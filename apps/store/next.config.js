import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackSupabaseHost = 'lhuudputwdjphaunimvn.supabase.co';
let supabaseStorageHost = fallbackSupabaseHost;
try {
  supabaseStorageHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${fallbackSupabaseHost}`).hostname;
} catch {
  // Keep the known project host as a safe development fallback. Invalid
  // deployment configuration must not broaden Next Image's remote allowlist.
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce the minimal Node runtime copied by the production Docker image.
  // The tracing root must include the monorepo packages used by the Store.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseStorageHost,
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'example.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/dashboard/widget',
        destination: '/dashboard/services/body-modeling',
        permanent: true,
      },
      {
        source: '/dashboard/vton-cache',
        destination: '/dashboard/services',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
