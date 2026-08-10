import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

// eslint-disable-next-line no-undef
const appRoot = __dirname;
const projectRoot = path.resolve(appRoot, "../..");
const nodeModules = path.resolve(appRoot, "node_modules");

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Array form (ordered, regex-capable). A plain string alias for "react"
    // would prefix-match "react-dom" and "react-redux" too, so the bare-import
    // rules below are anchored regexes.
    alias: [
      // The franchise flow demo imports the mockup engine through this alias.
      { find: "@studio-bridge", replacement: path.resolve(appRoot, "src/studio-bridge") },
      // The demo itself lives in the project's docs/ as the canonical UX
      // reference (CLAUDE.md). Aliasing rather than copying keeps one copy.
      { find: "@demo", replacement: path.resolve(projectRoot, "docs/flow-demo.jsx") },
      { find: /^@\//, replacement: path.resolve(appRoot, "src") + "/" },
      // Because the demo lives outside this app's root, Node resolution from it
      // never reaches our node_modules. Pin its bare imports explicitly.
      { find: /^react$/, replacement: path.resolve(nodeModules, "react") },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(nodeModules, "react/jsx-runtime") },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(nodeModules, "react/jsx-dev-runtime") },
      { find: /^lucide-react$/, replacement: path.resolve(nodeModules, "lucide-react") },
    ],
  },
  server: {
    fs: {
      // Permit serving the demo file from outside this app's root.
      allow: [projectRoot],
    },
  },
});
