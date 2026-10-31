export default async function run(page, ui) {
  await page.waitForTimeout(10000);
  const consoleErrs = [];
  // Capture any page errors thrown during live frame stepping.
  const state = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      status: /LIVE|PAUSED/.exec(txt)?.[0] ?? null,
      transcriptState: /WAITING|LISTENING|LIVE/.exec(txt)?.[0] ?? null,
      signals: (
        txt.match(
          /GAZE[\s\S]{0,40}|EXPRESSION[\s\S]{0,40}|PACE[\s\S]{0,40}/g,
        ) || []
      ).slice(0, 3),
    };
  });
  return state;
}
