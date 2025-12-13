import { loadFont as loadFontNoto } from "@remotion/google-fonts/NotoSans";
import { loadFont as loadFontAR } from "@remotion/google-fonts/NotoSansArabic";
import { loadFont as loadFontJP } from "@remotion/google-fonts/NotoSansJP";
import { loadFont as loadFontKR } from "@remotion/google-fonts/NotoSansKR";
import { loadFont as loadFontSC } from "@remotion/google-fonts/NotoSansSC";
import { AbsoluteFill, getStaticFiles, Img, random } from "remotion";
import { z } from "zod";
import { LoopableOffthreadVideo } from "./LoopableOffthreadVideo";
import { defaultThumbnailSchema } from "./Root";

// 1. Universal Font Stack
const { fontFamily: fontBase } = loadFontNoto();
const { fontFamily: fontJP } = loadFontJP();
const { fontFamily: fontKR } = loadFontKR();
const { fontFamily: fontSC } = loadFontSC();
const { fontFamily: fontArabic } = loadFontAR();
const universalFontFamily = `${fontBase}, ${fontJP}, ${fontKR}, ${fontSC}, ${fontArabic}, sans-serif`;

// --- NEW: Dynamic Font Size Logic ---
// Calculates font size based on character count to fill space without overflowing
const getDynamicFontSize = (text: string) => {
  const len = text.length;
  if (len <= 10) return "11rem"; // Short titles (e.g. "Stay")
  if (len <= 20) return "9rem";  // Medium titles
  if (len <= 35) return "7rem";  // Long titles
  if (len <= 50) return "5rem";  // Very long titles
  return "4rem";                 // Fallback for paragraphs
};

// Helper: Cyan Audio Bars
const AudioBar = ({ height }: { height: number }) => (
  <div
    style={{
      width: "15px",
      height: `${height}px`,
      background: "linear-gradient(to top, #00b7ff, #ffffff)",
      borderRadius: "4px",
      boxShadow: "0 0 15px #00b7ff",
      margin: "0 8px",
      opacity: 0.9,
    }}
  />
);

// SVG Microphone Icon
const MicIcon = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ marginRight: 15 }}
  >
    <path
      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
      fill="#00b7ff"
    />
    <path
      d="M19 10v2a7 7 0 0 1-14 0v-2"
      stroke="#00b7ff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="12"
      y1="19"
      x2="12"
      y2="23"
      stroke="#00b7ff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="8"
      y1="23"
      x2="16"
      y2="23"
      stroke="#00b7ff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function ThumbnailCreator(
  props: z.infer<typeof defaultThumbnailSchema>,
) {
  // Generate random heights for visualizer
  const seed = props.musicTitle.length;
  const bars = new Array(7).fill(0).map((_, i) => ({
    height: 30 + Math.floor(random(seed + i) * 80),
  }));

  const bgSrc =
    process.env.REMOTION_USE_LOCAL_DIR === "yes"
      ? getStaticFiles().find((a) => a.name.startsWith("background"))!.src
      : typeof props.background === "string"
        ? props.background
        : props.background.video;

  // Calculate font size once
  const titleFontSize = getDynamicFontSize(props.musicTitle);

  return (
    <AbsoluteFill>
      {/* 1. Background Layer */}
      <AbsoluteFill>
        {typeof props.background === "string" ? (
          <Img
            src={bgSrc}
            style={{
              objectFit: "cover",
              width: "100%",
              height: "100%",
              transform: "scale(1.1)",
              filter: "blur(6px) brightness(0.4) saturate(120%)",
            }}
          />
        ) : (
          <LoopableOffthreadVideo
            src={bgSrc}
            style={{
              objectFit: "cover",
              width: "100%",
              height: "100%",
              transform: "scale(1.1)",
              filter: "blur(6px) brightness(0.4) saturate(120%)",
            }}
            muted
          />
        )}

        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: `radial-gradient(circle at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.9) 100%)`,
          }}
        />
      </AbsoluteFill>

      {/* 2. Content Container */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        {/* Top: Visualizer */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            height: "80px",
            marginBottom: "30px",
          }}
        >
          {bars.map((bar, i) => (
            <AudioBar key={i} height={bar.height} />
          ))}
        </div>

        {/* Main Title - Stacked Layers for "Karaoke Stroke" effect */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            textAlign: "center",
            maxWidth: "95%",
            marginBottom: "40px",
            // Allow word wrapping but ensure centered alignment
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          {/* Layer 1: The Stroke/Outline (Black) */}
          <h1
            style={{
              fontFamily: universalFontFamily,
              fontSize: titleFontSize, // <--- DYNAMIC SIZE APPLIED
              fontWeight: 900,
              lineHeight: 1.1, // Slightly loose to prevent stroke overlap on multi-line
              textTransform: "uppercase",
              margin: 0,
              color: "transparent",
              WebkitTextStroke: "15px black", 
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              zIndex: -1,
              wordWrap: "break-word"
            }}
          >
            {props.musicTitle}
          </h1>

          {/* Layer 2: The Main White Text */}
          <h1
            style={{
              fontFamily: universalFontFamily,
              fontSize: titleFontSize, // <--- DYNAMIC SIZE APPLIED
              fontWeight: 900,
              lineHeight: 1.1,
              textTransform: "uppercase",
              margin: 0,
              color: "white",
              textShadow: "0 10px 40px rgba(0,0,0,0.5)",
              wordWrap: "break-word"
            }}
          >
            {props.musicTitle}
          </h1>
        </div>

        {/* "KARAOKE" Badge */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.6)",
            border: "3px solid #00b7ff",
            padding: "1rem 3rem",
            borderRadius: "50px",
            boxShadow: "0 0 30px rgba(0, 183, 255, 0.4), inset 0 0 20px rgba(0, 183, 255, 0.2)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "10px"
          }}
        >
          <MicIcon />
          <span
            style={{
              color: "white",
              fontSize: "2.5rem",
              fontWeight: 800,
              letterSpacing: "0.15em",
              fontFamily: universalFontFamily,
              textTransform: "uppercase",
              textShadow: "0 0 10px #00b7ff",
            }}
          >
            Karaoke
          </span>
        </div>
      </AbsoluteFill>

      {/* 3. Bottom Progress Bar Decoration */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "12px",
          background: "#111",
          display: "flex",
        }}
      >
        <div
          style={{
            width: "65%",
            height: "100%",
            background: "#00b7ff",
            boxShadow: "0 0 20px #00b7ff",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}