# Quick start

```bash
npm install      # copies the MediaPipe WASM runtime, fetches the 3 model bundles
```

Configure `DATABASE_URL` and `AUTH_SECRET` in the server environment before starting the app. For
local development, use a separate disposable Neon database, not production:

```bash
npm run dev      # http://localhost:3000
```

Create an account at **`/signup`**, open **Studio → Enable camera & mic**, and speak for a minute.

> There is no seeded, demo or admin login: a fresh checkout must go through `/signup` once. Signing in lands on
> `/dashboard` (session history), and `?next=/studio` takes you straight to the camera.

Want to see the output first? **`/report/demo`** is a public, fully scored sample session — no
sign-in required.

**Requirements:** a Chromium browser (Chrome or Edge), a webcam and a microphone. A GPU is used
when available; the engine falls back to CPU automatically.

The Free plan allows five analyses a month and ten minutes per session; `/pricing` lists
what Pro adds. Quotas are enforced server-side, not hidden behind a paywall banner.

---

# Why it exists

Feedback on speaking is either absent or polite. A mirror cannot tell you that your gaze left the
lens eleven times, that your pitch moved across four semitones when you needed nine, or that you
were upright only 71% of the session. Those are the things audiences notice and speakers never see.

VisionSpeak measures them continuously, scores them against a published model, and turns each
measurement into a specific drill — then keeps the history so you can see whether the habit you
fixed last month is still fixed today.

**Everything runs on-device.** The MediaPipe models load once into your browser as WebAssembly and
infer there; no frame, no audio, no landmark ever reaches a server.
