/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@prisma/**',
      'node_modules/@types/**',
      'node_modules/typescript/**',
      'node_modules/eslint/**',
      'node_modules/prettier/**',
      'node_modules/esbuild/**',
      'src/generated/prisma/**',
    ],
  },
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
