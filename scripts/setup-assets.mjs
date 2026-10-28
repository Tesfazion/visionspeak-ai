/**
 * Prepares the MediaPipe runtime so the app works without a CDN dependency:
 *
 *  1. Copies the WASM binary + JS glue that ships inside `@mediapipe/tasks-vision`
 *     into `public/mediapipe/wasm`.
 *  2. Downloads the three `.task` model bundles (face / pose / hands) into
 *     `public/mediapipe/models` the first time it runs.
 *
 * Failures are non-fatal: the client falls back to Google's CDN at runtime.
 */
import { cp, mkdir, access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const wasmSrc = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDest = path.join(root, "public", "mediapipe", "wasm");
const modelDest = path.join(root, "public", "mediapipe", "models");

const MODELS = [
  ["face_landmarker.task", "face_landmarker/face_landmarker/float16/1/face_landmarker.task"],
  ["pose_landmarker_lite.task", "pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"],
  ["hand_landmarker.task", "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"],
];

const exists = (p) => access(p).then(() => true, () => false);

async function copyWasm() {
  if (!(await exists(wasmSrc))) {
    console.warn("[setup-assets] MediaPipe package not installed yet, skipping WASM copy.");
    return;
  }
  await mkdir(wasmDest, { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  console.log("[setup-assets] Copied MediaPipe WASM runtime -> public/mediapipe/wasm");
}

async function downloadModels() {
  await mkdir(modelDest, { recursive: true });
  for (const [file, remote] of MODELS) {
    const target = path.join(modelDest, file);
    if (await exists(target)) {
      console.log(`[setup-assets] ${file} already present.`);
      continue;
    }
    const url = `https://storage.googleapis.com/mediapipe-models/${remote}`;
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(target));
      console.log(`[setup-assets] Downloaded ${file}`);
    } catch (err) {
      console.warn(`[setup-assets] Could not download ${file}: ${err.message}. The app will fall back to the CDN.`);
    }
  }
}

try {
  await copyWasm();
  await downloadModels();
} catch (err) {
  console.warn("[setup-assets] Non-fatal setup error:", err.message);
}
