// Copies the JSON store into backups/<timestamp>/ and keeps the last 30.
//   npm run backup
//
// A backup is only useful if it can be restored: see scripts/restore.mjs, which
// takes one of the printed directories. `auth-secret` is included on purpose —
// without it every issued session cookie is invalid after a restore.
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_FILES, resolveDataDir } from "./lib/data-dir.mjs";

const KEEP = 30;

async function main() {
  const dataDir = resolveDataDir();
  const backupsDir = path.join(process.cwd(), "backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(backupsDir, stamp);
  await fs.mkdir(backupDir, { recursive: true });

  const copied = [];
  const missing = [];
  for (const file of DATA_FILES) {
    try {
      await fs.copyFile(path.join(dataDir, file), path.join(backupDir, file));
      copied.push(file);
    } catch (err) {
      if (err?.code === "ENOENT") missing.push(file);
      else throw err;
    }
  }

  // Prune oldest first; a stat failure means the entry is not ours to judge.
  const dirs = [];
  for (const entry of await fs.readdir(backupsDir)) {
    const full = path.join(backupsDir, entry);
    const stat = await fs.stat(full).catch(() => null);
    if (stat?.isDirectory()) dirs.push({ name: entry, mtime: stat.mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  for (const stale of dirs.slice(KEEP)) {
    await fs.rm(path.join(backupsDir, stale.name), { recursive: true, force: true });
  }

  console.log(`Backup ${backupDir}`);
  console.log(`  copied:  ${copied.join(", ") || "(none)"}`);
  if (missing.length) console.log(`  absent:  ${missing.join(", ")} (never created)`);
  console.log(`  kept:    ${Math.min(dirs.length, KEEP)} of ${KEEP} most recent backups`);
}

main().catch((err) => {
  console.error("[backup] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
