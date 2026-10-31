export default async function run(page, ui) {
  // Click "Try again" to grant permissions from the fake device prompt.
  const snap = await ui.snapshot();
  const tryRef =
    snap.match(/@(e\d+) button "Try again"/)?.[1] ||
    snap.match(/@(e\d+) button "Enable camera & mic"/)?.[1];
  if (!tryRef) return { error: "no retry button", snap };
  await ui.click(tryRef);
  await page.waitForTimeout(15000);

  const state = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      cameraNote: /camera unavailable|blocked/i.test(txt),
      transcriptVisible: /transcript/i.test(txt),
      stopVisible: /stop session|finish/i.test(txt),
    };
  });
  return state;
}
