export default async function run(page, ui) {
  // Reach INTO the nextjs-portal shadow DOM for the real dialog content.
  const overlay = await page.evaluate(() => {
    const results = [];
    const dig = (root, depth) => {
      if (!root || depth > 4) return;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) dig(el.shadowRoot, depth + 1);
      }
      const dialog = root.querySelector(
        "[data-nextjs-dialog], [role=dialog], nextjs-portal-errors, .error-overlay, [data-nextjs-error-overlay]",
      );
      if (dialog)
        results.push(
          (dialog.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500),
        );
      const h1 = root.querySelector("h1, h2");
      if (h1) results.push("H: " + h1.textContent.trim().slice(0, 200));
    };
    for (const p of document.querySelectorAll("nextjs-portal"))
      dig(p.shadowRoot, 1);
    return results;
  });
  return { overlay };
}
