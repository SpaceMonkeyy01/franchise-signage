import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // reference/design-studio is a READ-ONLY copy of the retail Design Studio
    // (CLAUDE.md): we never modify it and never import from it, so its lint
    // findings are noise that would drown our own.
    "reference/**",
    // docs/flow-demo.jsx is the canonical UX reference, not app source — it is
    // read and matched against, never compiled or shipped.
    "docs/**",
  ]),
]);

export default eslintConfig;
