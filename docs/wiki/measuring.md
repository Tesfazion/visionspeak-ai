# What is actually measured

| Signal                 | Source (on-device)                               | Metrics                                                                                                |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Eye contact & gaze** | MediaPipe Face Landmarker — 478 landmarks + iris | lens time %, gaze breaks + durations, blink rate, head stability                                       |
| **Head orientation**   | facial transformation matrix                     | yaw / pitch / roll in degrees                                                                          |
| **Facial expression**  | 52 ARKit-style blendshapes                       | smile presence, expression range, tension, 6-way emotion distribution                                  |
| **Posture**            | MediaPipe Pose Landmarker — 33 landmarks         | shoulder slope, torso lean, head-over-shoulders, upright %, sway                                       |
| **Gestures**           | MediaPipe Hand Landmarker — 21 points × 2        | gestures/min, hands-in-frame %, openness, nervousness index, symmetry                                  |
| **Voice**              | Web Audio API `AnalyserNode`                     | loudness (dBFS), energy, volume consistency, pitch variation in semitones, pauses, speaking-time ratio |
| **Speech**             | Web Speech API                                   | transcript, WPM, filler words per 100 words                                                            |

Facial-expression categories are simplified heuristics over facial movement, not reliable emotion
detection. Composite scores are practice indicators, not direct measures of audience reaction or
personality; setup and browser conditions can affect them.

> **Why the browser instead of Python?** The original spec called for MediaPipe + TensorFlow +
> DeepFace + Whisper in Python. Those wheels do not exist for this stack, so a Python service could
> not actually run. Executing the _identical_ MediaPipe models through WebAssembly is faster (no
> upload, no round trip), fully private, and still genuine inference. A server-side batch pipeline
> for uploaded recordings is the natural Phase 2 — the scoring model is model-agnostic.
