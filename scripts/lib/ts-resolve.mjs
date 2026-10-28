// Makes `@/…` and extension-less relative imports resolvable when the app's
// TypeScript sources are executed directly by Node's test runner.
//
// Loaded with `--import ./scripts/lib/ts-resolve.mjs`; Node strips (or, with
// --experimental-transform-types, rewrites) the type syntax itself.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(import.meta.dirname, "..", "..", "src");

const candidates = (base) => [
  base,
  `${base}.ts`,
  `${base}.tsx`,
  `${base}.mts`,
  path.join(base, "index.ts"),
  path.join(base, "index.tsx"),
];

function resolveToFile(base) {
  for (const candidate of candidates(base)) {
    if (existsSync(candidate) && !candidate.endsWith(".d.ts")) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const file = resolveToFile(path.join(SRC, specifier.slice(2)));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }

    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const file = resolveToFile(path.resolve(parentDir, specifier));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
