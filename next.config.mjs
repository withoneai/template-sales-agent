import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
export default {
  // A lockfile further up the tree would otherwise become the workspace root.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  devIndicators: false,
};
