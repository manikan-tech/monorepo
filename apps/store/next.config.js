import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
        hostname: 'lhuudputwdjphaunimvn.supabase.co',
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
