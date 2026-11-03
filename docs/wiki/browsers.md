# Browser support

| Browser | Studio | Report & dashboard |
| --- | --- | --- |
| Chrome / Edge (desktop) | ✅ full — including transcript + filler detection | ✅ |
| Chrome (Android) | ✅ over HTTPS | ✅ |
| Safari | ⚠️ Web Speech is unsupported — pace falls back to the acoustic estimator, filler counts are unavailable | ✅ |
| Firefox | ⚠️ same Web Speech limitation | ✅ |

Without Web Speech the session still scores: pace and pauses are derived from the audio envelope,
and the report states which estimator produced them (`paceSource`).
