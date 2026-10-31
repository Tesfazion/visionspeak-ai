export default async function run(page, ui) {
  // Count DOM nodes inside portals' shadow roots to see if any actual dialog
  // content exists, or if the portal only holds a stylesheet (i.e. no visible
  // error is being displayed right now).
  const info = await page.evaluate(() => {
    return [...document.querySelectorAll("nextjs-portal")].map((p) => {
      const root = p.shadowRoot;
      if (!root) return { empty: true };
      const all = root.querySelectorAll("*");
      const styleOnly = [...all].every((el) =>
        ["STYLE", "NEXTJS-PORTAL"].includes(el.tagName),
      );
      return {
        nodes: all.length,
        styleOnly,
        bodyText: (root.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120),
      };
    });
  });
  return info;
}
