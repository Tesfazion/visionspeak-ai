// Makes `@/…` and extension-less relative imports resolvable when the app's
// TypeScript sources are executed directly by Node's test runner.
//
// Loaded with `--import ./scripts/lib/ts-resolve.mjs`; Node strips (or, with
// --experimental-transform-types, rewrites) the type syntax itself.
//
// Query strings and hashes are preserved: `import("@/lib/data-dir.ts?fresh")`
// is how a test gets a *second* module instance (Node keys the registry on the
// full specifier), which matters for modules that read `process.env` at load.
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

/** Splits `./x.ts?case=1#frag` into the path part and the suffix to re-append. */
function splitSuffix(specifier) {
  const index = specifier.search(/[?#]/);
  if (index === -1) return { bare: specifier, suffix: "" };
  return { bare: specifier.slice(0, index), suffix: specifier.slice(index) };
}

const toUrl = (file) => pathToFileURL(file).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const { bare, suffix } = splitSuffix(specifier);

    if (bare.startsWith("@/")) {
      const file = resolveToFile(path.join(SRC, bare.slice(2)));
      if (file) return { url: toUrl(file) + suffix, shortCircuit: true };
    }

    if ((bare.startsWith("./") || bare.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL.split(/[?#]/)[0]));
      const file = resolveToFile(path.resolve(parentDir, bare));
      if (file) return { url: toUrl(file) + suffix, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
