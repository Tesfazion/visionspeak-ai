# VisionSpeak AI

**An on-device speaking coach that turns observable delivery cues into practice feedback.**

VisionSpeak AI tracks visible and audible cues while you practice — gaze toward the camera, posture,
gestures, vocal delivery and facial movement — then turns them into coaching indicators and drills.
Scores named **confidence**, **engagement** and **leadership presence** are practice heuristics, not
direct measures of audience reaction, personality or speaking ability.

Every score traces back to a model output. Nothing is mocked, randomised or invented for show.
Everything runs **on-device** — no frame, no audio, no landmark ever reaches a server.

[![CI](https://github.com/Tesfazion/visionspeak-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Tesfazion/visionspeak-ai/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16.4-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.3-087ea4?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)

## Get started

```bash
npm install      # copies the MediaPipe WASM runtime, fetches the 3 model bundles
npm run dev      # http://localhost:3000
```

`DATABASE_URL` and `AUTH_SECRET` are required in the server environment. On Vercel, configure them in
the project's Environment Variables. Local development requires a separate disposable Neon database;
never point local tests at production data. Set `TEST_DATABASE_URL` to a disposable Neon database
branch for database-backed tests; GitHub Actions requires it as a repository secret.

Create an account at **`/signup`**, open **Studio → Enable camera & mic**, and speak for a minute.
Want to see the output first? **`/report/demo`** is a public, fully scored sample session — no
sign-in required. Requirements: a Chromium browser (Chrome or Edge), a webcam and a microphone.

## AI speaking coach

Sign in and open **AI coach** (or `/ai`) to chat and request AI feedback on saved sessions. Add an
OpenAI, OpenRouter or Anthropic key on that page or under **Account settings**. Requests use your
provider account and are billed by that provider. Keys are encrypted at rest using the stable
`AUTH_SECRET`; rotating that secret requires reconnecting provider keys.

AI session feedback uses the saved report metrics and does not send the session transcript. Chat
messages are sent to the provider you select. Camera frames and audio remain on-device.

## Documentation

|                                                                     |                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| [Why it exists](docs/wiki/quick-start.md#why-it-exists)             | the problem the product exists to solve               |
| [What is actually measured](docs/wiki/measuring.md)                 | every signal, its on-device source and metrics        |
| [Quick start](docs/wiki/quick-start.md)                             | install, run, first session, plans                    |
| [Routes](docs/wiki/routes.md)                                       | every page and API endpoint, plus plans & quotas      |
| [The scoring model](docs/wiki/scoring.md)                           | published weights, curves and grades                  |
| [Mode rubrics](docs/wiki/scoring.md#mode-rubrics)                   | practice · presentation · interview                   |
| [Architecture](docs/wiki/architecture.md)                           | browser inference, route handlers, PostgreSQL         |
| [Project layout](docs/wiki/project-layout.md)                       | what lives where in `src/`                            |
| [Configuration](docs/wiki/configuration.md)                         | environment variables for PostgreSQL, auth and services |
| [Deployment](docs/wiki/deployment.md)                               | PostgreSQL setup, self-hosting, Docker                |
| [Neon/Vercel audit](docs/neon-vercel-audit.md)                      | production readiness findings and remaining concerns   |
| [Testing](docs/wiki/testing.md)                                     | unit, end-to-end and meeting suites, CI               |
| [Privacy & security](docs/wiki/privacy.md)                          | what stays on-device and how accounts are protected   |
| [Internationalisation](docs/wiki/i18n.md)                           | en · am · es · fr, switcher, fallback                 |
| [Responsive & accessible](docs/wiki/i18n.md#responsive--accessible) | breakpoints, motion, screen readers                   |
| [Browser support](docs/wiki/browsers.md)                            | what works in Safari and Firefox, and what degrades   |
| [Scripts & roadmap](docs/wiki/roadmap.md)                           | every npm command, what shipped, what is next         |
| [Diagnostics](docs/README.md)                                       | how the `docs/` tree and probe scripts work           |

## License

This is a personal project. It is **not** licensed for reuse, redistribution or commercial use —
all rights are reserved by the author. See [LICENSE](LICENSE).
