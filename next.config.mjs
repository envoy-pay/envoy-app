/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["envoy-pay", "@open-wallet-standard/core"],
  },
};

export default nextConfig;
