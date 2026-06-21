/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // onnxruntime-web ships .wasm assets; mark it external so Next's server
  // bundler does not try to inline the WASM binary (see tech_design §4).
  serverExternalPackages: ["onnxruntime-web"],
};

export default nextConfig;
