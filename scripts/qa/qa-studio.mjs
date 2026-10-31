export default async function run(page, ui) {
  // Pick Amharic BEFORE starting, the natural flow.
  await ui.click("@e9");
  await page.waitForTimeout(300);

  // Grant the fake camera/mic if Chromium offers the permission dialog (headless
  // flag usually auto-grants). Then start.
  const startRef = (await ui.snapshot()).match(
    /@(e\d+) button "Start session"/,
  )?.[1];
  if (!startRef) return { error: "no start button" };
  await ui.click(startRef);

  // Wait for the session to actually go live (phase changes, overlays mount).
  await page.waitForTimeout(9000);

  // Ask the page what it thinks is going on.
  const state = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      hasErrorOverlay: Boolean(document.querySelector("nextjs-portal")),
      errorText: [...document.querySelectorAll("nextjs-portal")]
        .map((n) => (n.shadowRoot?.textContent || "").slice(0, 300))
        .filter(Boolean),
      transcriptVisible: /transcript/i.test(txt),
      audioOnlyNotice: /audio.only|audio only/i.test(txt),
      snippet: txt.slice(0, 600),
    };
  });
  return state;
}
