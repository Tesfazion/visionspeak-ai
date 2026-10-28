import assert from "node:assert/strict";
import { test } from "node:test";
import {
  atTarget,
  bandScore,
  clamp,
  clamp01,
  ema,
  formatClock,
  formatDuration,
  lowScore,
  mean,
  percentile,
  round,
  std,
  sweetSpot,
} from "@/lib/math";

test("clamp bounds values", () => {
  assert.equal(clamp(120), 100);
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(42), 42);
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(clamp01(1.7), 1);
});

test("atTarget peaks at the ideal and decays with distance", () => {
  assert.equal(atTarget(92, 92, 58), 100);
  assert.equal(atTarget(92 - 58, 92, 58), 0);
  assert.ok(atTarget(80, 92, 58) > atTarget(60, 92, 58));
  // Symmetric above and below the target.
  assert.equal(atTarget(104, 92, 58), atTarget(80, 92, 58));
  // Never leaves 0..100.
  for (const value of [-100, 0, 50, 200]) {
    const score = atTarget(value, 92, 58);
    assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`);
  }
});

test("lowScore gives full marks below the ideal", () => {
  assert.equal(lowScore(0.5, 1, 5), 100);
  assert.equal(lowScore(6, 1, 5), 0);
  assert.ok(lowScore(3, 1, 5) < 100 && lowScore(3, 1, 5) > 0);
});

test("bandScore is a plateau between bad and good", () => {
  assert.equal(bandScore(0, 10, 30, 60, 80), 0);
  assert.equal(bandScore(60, 10, 30, 60, 80), 100);
  assert.equal(bandScore(80, 10, 30, 60, 80), 0);
});

test("sweetSpot rewards the comfortable range", () => {
  assert.equal(sweetSpot(12, 10, 20, 10), 100);
  assert.equal(sweetSpot(0, 10, 20, 10), 0);
});

test("ema moves toward the target", () => {
  assert.equal(ema(0, 100, 0.5), 50);
  assert.equal(ema(0, 100, 0), 0);
  assert.equal(ema(0, 100, 1), 100);
});

test("mean and std", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(mean([]), 0);
  assert.equal(std([5]), 0);
  assert.ok(Math.abs(std([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
});

test("percentile interpolates", () => {
  assert.equal(percentile([1, 2, 3, 4], 0), 1);
  assert.equal(percentile([1, 2, 3, 4], 1), 4);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([], 0.5), 0);
});

test("round respects decimal places", () => {
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(round(1.5), 2);
  assert.equal(round(1.005, 2), 1);
});

test("formatClock and formatDuration", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(75), "01:15");
  assert.equal(formatDuration(45), "45s");
  assert.equal(formatDuration(90), "1m 30s");
  assert.equal(formatDuration(3700), "1h 1m");
});
