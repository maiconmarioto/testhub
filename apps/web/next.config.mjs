/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['host.docker.internal'],
  output: 'standalone',
};

export default nextConfig;
