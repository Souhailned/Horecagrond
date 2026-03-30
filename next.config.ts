import type { NextConfig } from "next";
import { withContentCollections } from "@content-collections/next";

const nextConfig: NextConfig = {
  output: "standalone",
  // R3F JSX type augmentations don't work with React 19 @types/react —
  // the original Pascal editor has the same errors. Runtime is unaffected.
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["mermaid"],
  transpilePackages: [
    "three",
    "@pascal-app/core",
    "@pascal-app/viewer",
    "@pascal-app/editor",
  ],
  turbopack: {
    resolveAlias: {
      react: "./node_modules/react",
      // Explicit subpath aliases — the bare "three" alias broke package.json
      // "exports" resolution for three/webgpu and three/tsl, causing WebGPU
      // materials (wall, ceiling, door, etc.) to silently fail.
      "three/webgpu": "./node_modules/three/build/three.webgpu.js",
      "three/tsl": "./node_modules/three/build/three.tsl.js",
      three: "./node_modules/three",
      "@react-three/fiber": "./node_modules/@react-three/fiber",
      "@react-three/drei": "./node_modules/@react-three/drei",
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "editor.pascal.app",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "pbs.twimg.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.vercel.app",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "avatar.vercel.sh",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "imagedelivery.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "d2vwwcvoksz7ty.cloudfront.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "pub-4a8739a12755457e8a9e7439e0b386a3.r2.dev",
        pathname: "/**",
      },
    ],
  },
};

// withContentCollections must be the outermost plugin
export default withContentCollections(nextConfig);
