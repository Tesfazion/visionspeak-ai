import { ImageResponse } from "next/og";

export const alt = "VisionSpeak AI — deliver like the room is yours";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social card for every shared link (Slack, X, LinkedIn, iMessage). */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0a0a12 0%, #12102a 45%, #080b14 100%)",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: "linear-gradient(135deg, #a78bfa, #7c5cff 55%, #22d3ee)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 99, background: "#06060b" }} />
          </div>
          <div style={{ color: "#f4f4f9", fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
            VisionSpeak AI
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              color: "#f4f4f9",
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2.5,
              maxWidth: 900,
            }}
          >
            Deliver like the room is yours.
          </div>
          <div style={{ color: "#8b8ba4", fontSize: 30, lineHeight: 1.35, maxWidth: 820 }}>
            Eye contact, posture, gestures, voice and expression — measured on-device and scored in real
            time.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["478-point face mesh", "33-point pose", "5 Hz scoring", "on-device"].map((chip) => (
            <div
              key={chip}
              style={{
                border: "1px solid #2a2a3d",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 999,
                padding: "10px 20px",
                color: "#b9b9cc",
                fontSize: 22,
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
