export default async function run(page, ui) {
  // Retry once more, in case the previous attempt left the flow at 'requesting'.
  const snap = await ui.snapshot();
  const tryRef = snap.match(
    /@(e\d+) button "(Try again|Enable camera & mic)"/,
  )?.[1];
  if (tryRef) await ui.click(tryRef);
  await page.waitForTimeout(5000);
  const t1 = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  return { t1 };
}
