// Restores a directory written by `npm run backup` into the app's data dir.
//   npm run restore -- backups/2026-10-31T10-00-00-000Z
//
// Existing files are overwritten and missing ones are left alone, so restoring a
// partial backup cannot silently delete a store the backup never had.
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_FILES, resolveDataDir } from "./lib/data-dir.mjs";

const files = DATA_FILES;

async function main() {
  const backupDir = process.argv[2];
  if (!backupDir) {
    console.error("Usage: npm run restore -- <backup-directory>");
    process.exit(1);
  }

  const dataDir = resolveDataDir();
  await fs.mkdir(dataDir, { recursive: true });

  const restored = [];
  const missing = [];
  for (const file of files) {
    try {
      await fs.copyFile(path.join(backupDir, file), path.join(dataDir, file));
      restored.push(file);
    } catch (err) {
      if (err?.code === "ENOENT") missing.push(file);
      else throw err;
    }
  }

  console.log(`Restored ${restored.length} file(s) from ${backupDir} to ${dataDir}`);
  if (restored.length) console.log(`  restored: ${restored.join(", ")}`);
  if (missing.length) console.log(`  absent:   ${missing.join(", ")} (left untouched)`);
}

main().catch((err) => {
  console.error("[restore] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
