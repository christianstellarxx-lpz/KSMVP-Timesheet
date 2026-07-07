/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma Client is a server-only dependency; keep it external to the bundle.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
