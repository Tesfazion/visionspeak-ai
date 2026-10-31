export default async function run(page, ui) {
  // Grant mic/camera permissions and start the session with the FAKE device
  // active, watching for the MediaPipe error the user reported.
  await page
    .context()
    .grantPermissions(["camera", "microphone"], {
      origin: "http://localhost:3000",
    });

  const snap = await ui.snapshot();
  const enableRef = snap.match(
    /@(e\d+) button "(Enable camera & mic|Try again)"/,
  )?.[1];
  if (!enableRef) return { error: "no enable button", snap };
  await ui.click(enableRef);

  // Give MediaPipe model loading + first frames plenty of time.
  await page.waitForTimeout(20000);

  const state = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      hasErrorOverlay: Boolean(document.querySelector("nextjs-portal")),
      overlayText: [...document.querySelectorAll("nextjs-portal")]
        .map((n) => (n.shadowRoot?.textContent || "").slice(0, 400))
        .filter((s) => s && !s.includes("host {")),
      cameraNote: /camera unavailable/i.test(txt),
      stopVisible: /stop session/i.test(txt),
      status: /LIVE|STANDBY|LOADING/.exec(txt)?.[0] ?? null,
    };
  });
  return state;
}
