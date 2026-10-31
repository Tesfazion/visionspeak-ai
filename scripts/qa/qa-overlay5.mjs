export default async function run(page, ui) {
  // The portal has a DIV + BUTTON + svg â€” check the div's aria/label and any
  // tooltip-ish text, plus whether the button hides the overlay.
  const info = await page.evaluate(() => {
    const p = document.querySelector("nextjs-portal");
    const root = p?.shadowRoot;
    if (!root) return { none: true };
    const btn = root.querySelector("button");
    const div = root.querySelector("div");
    return {
      btnAria: btn?.getAttribute("aria-label") || btn?.title || null,
      btnVisible: btn ? btn.getBoundingClientRect().width > 0 : false,
      divAria: div?.getAttribute("aria-label") || null,
      divTitle: div?.getAttribute("title") || null,
    };
  });

  // Take a screenshot cropped to full window to visually see if an error
  // overlay banner is showing.
  await page.screenshot({
    path: "c:/Protected File/Real Project/VisionSpeak AI/.next/qa-overlay.png",
  });
  return info;
}
