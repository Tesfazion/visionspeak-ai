export default async function run(page, ui) {
  // Session already running. Read what the Next.js error overlay shows.
  const overlay = await page.evaluate(() => {
    const portals = [...document.querySelectorAll("nextjs-portal")];
    return portals
      .map((n) => {
        const root = n.shadowRoot;
        if (!root) return null;
        const txt = (root.textContent || "").replace(/\s+/g, " ").trim();
        return txt.slice(0, 600);
      })
      .filter(Boolean);
  });

  // Also collect pageerrors reported via the console-capture the runner already
  // does, but read runtime state of the engine through a small probe.
  const probe = await page.evaluate(async () => {
    const out = {};
    // Is the face landmarker producing anything? Watch overlay canvas drawing.
    const canvas = document.querySelector("canvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonzero = 0;
      for (let i = 3; i < data.length; i += 400) if (data[i] > 0) nonzero++;
      out.overlayNonzeroAlphaSamples = nonzero;
    }
    return out;
  });
  return { overlay, probe };
}
