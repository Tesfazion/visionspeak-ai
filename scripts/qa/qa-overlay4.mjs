export default async function run(page, ui) {
  // Look for visible error dialog text INSIDE the shadow root, listing tag
  // names so we know where the dialog content lives.
  const info = await page.evaluate(() => {
    const p = document.querySelector("nextjs-portal");
    const root = p?.shadowRoot;
    if (!root) return { none: true };
    const tags = [...root.querySelectorAll("*")]
      .map((e) => e.tagName)
      .filter((t, i, a) => a.indexOf(t) === i);
    // Find any element with substantial text that isn't a style.
    const texts = [...root.querySelectorAll("*")]
      .filter(
        (e) =>
          e.tagName !== "STYLE" &&
          e.children.length === 0 &&
          (e.textContent || "").trim().length > 3,
      )
      .map((e) => e.textContent.trim().slice(0, 150));
    return { tags, texts: texts.slice(0, 20) };
  });
  return info;
}
