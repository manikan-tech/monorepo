/** @type {import('next').NextConfig} */
const nextConfig = {
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
