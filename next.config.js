/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite importar imagens da pasta /public/uploads e de domínios CDN externos.
  images: {
    unoptimized: true,
    remotePatterns: [
      // Cloudflare R2 (subdomínio padrão)
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.r2.dev' },
      // AWS S3
      { protocol: 'https', hostname: '*.s3.amazonaws.com' },
      { protocol: 'https', hostname: 's3.*.amazonaws.com' },
      // Backblaze B2
      { protocol: 'https', hostname: 's3.*.backblazeb2.com' },
      { protocol: 'https', hostname: 'f*.backblazeb2.com' },
      // CDNs comuns
      { protocol: 'https', hostname: '*.cloudfront.net' },
      { protocol: 'https', hostname: '*.b-cdn.net' },          // Bunny
    ],
  },
  // Pacotes nativos / opcionais NÃO devem ser empacotados pelo webpack.
  experimental: {
    serverComponentsExternalPackages: [
      'better-sqlite3',
      '@tensorflow/tfjs-node',
      '@vladmandic/face-api',
      'sharp',
      'ffmpeg-static',
      '@aws-sdk/client-s3',
      '@aws-sdk/s3-request-presigner',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)
      externals.push({
        '@tensorflow/tfjs-node': 'commonjs @tensorflow/tfjs-node',
        'better-sqlite3': 'commonjs better-sqlite3',
      })
      config.externals = externals
    }
    return config
  },
};

module.exports = nextConfig;
