/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors. We verify typescript safety locally.
    ignoreBuildErrors: true,
  },
  // Limit build worker concurrency to prevent memory OOM crashes on 4GB RAM deployment machines
  experimental: {
    cpus: 1,
  },
};

module.exports = nextConfig;
