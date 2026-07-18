/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors. We verify typescript safety locally.
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
