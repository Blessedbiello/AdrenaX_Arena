/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.adrena.trade' }
    ]
  }
};
module.exports = nextConfig;
