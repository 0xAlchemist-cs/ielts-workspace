import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This app's UI copy is full of English apostrophes (Today's, don't, it's);
      // escaping them as &apos; everywhere hurts source readability for no gain.
      "react/no-unescaped-entities": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Release staging copies carry their own .next build output; the root-only
    // ".next/**" pattern above does not reach into dist/.
    "dist/**",
  ]),
]);

export default eslintConfig;
