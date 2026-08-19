import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Yoxa calls this app's API routes from outside the browser, so nothing here
  // may assume a same-origin request. Route-level auth does that work instead.
  reactStrictMode: true,
};

export default nextConfig;
