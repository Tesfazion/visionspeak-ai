// eslint-config-next 16 ships native flat configs, so no FlatCompat shim is
// needed (that path throws "Converting circular structure to JSON").
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "docs/**",
      "public/**",
      "scripts/**",
      "next-env.d.ts",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // The engine works with MediaPipe's loosely-typed results; `any` there is
      // deliberate and documented, so warn rather than fail the build.
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Route handlers and tests legitimately log and use loose types.
    files: ["tests/**/*.ts", "src/app/api/**/*.ts"],
    rules: { "no-console": "off", "@typescript-eslint/no-explicit-any": "off" },
  },
];
