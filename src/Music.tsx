import { useAudioData } from "@remotion/media-utils";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  getStaticFiles,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useCurrentScale,
  useVideoConfig,
} from "remotion";
import {
  Animated,
  Animation,
  Ease,
  Move,
  Rotate,
  Scale,
} from "remotion-animated";
import { z } from "zod";
import { LoopableOffthreadVideo } from "./LoopableOffthreadVideo";
import { DefaultSchema } from "./Root";
import normalizeAudioData from "./normalizeAudioData";

import { loadFont as loadFontNoto } from "@remotion/google-fonts/NotoSans";
import { loadFont as loadFontAR } from "@remotion/google-fonts/NotoSansArabic";
import { loadFont as loadFontJP } from "@remotion/google-fonts/NotoSansJP";
import { loadFont as loadFontKR } from "@remotion/google-fonts/NotoSansKR";
import { loadFont as loadFontSC } from "@remotion/google-fonts/NotoSansSC";

const { fontFamily: fontBase } = loadFontNoto();
const { fontFamily: fontJP } = loadFontJP();
const { fontFamily: fontKR } = loadFontKR();
const { fontFamily: fontSC } = loadFontSC();
const { fontFamily: fontArabic } = loadFontAR();
const universalFontFamily = `${fontBase}, ${fontJP}, ${fontKR}, ${fontSC}, ${fontArabic}, sans-serif`;

// --- COMPONENT: Instrumental Countdown ---
const CountdownIndicator = ({ timeUntilNext }: { timeUntilNext: number }) => {
  // Logic: 3 dots.
  // 3.0s - 2.0s left: 1st dot active
  // 2.0s - 1.0s left: 1st & 2nd dot active
  // 1.0s - 0.0s left: All 3 active
  
  return (
    <div style={{
      position: 'absolute',
      top: '38%', 
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      gap: 20
    }}>
      {[3, 2, 1].map((num) => {
        // Active if time is less than this number (e.g. at 2.9s, '3' is active)
        const isActive = timeUntilNext <= num;
        
        return (
          <div key={num} style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            // Blue if active, faint white if inactive
            backgroundColor: isActive ? '#00b7ff' : 'rgba(255,255,255,0.1)',
            boxShadow: isActive ? '0 0 15px #00b7ff' : 'none',
            transition: 'all 0.1s ease-in-out',
            transform: isActive ? 'scale(1.3)' : 'scale(1)'
          }} />
        )
      })}
    </div>
  )
}

// --- COMPONENT: Lyric with Bar Indicator ---
const LyricWithBar = ({
  text,
  progress,
  fontFamily,
  isInstrumental
}: {
  text: string;
  progress: number;
  fontFamily: string;
  isInstrumental: boolean;
}) => {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      width: '100%',
      position: 'relative' 
    }}>
      <div
        style={{
          fontFamily: fontFamily,
          fontSize: isInstrumental ? 90 : 70, // Make ♫ symbol larger
          fontWeight: 900,
          textAlign: "center",
          color: "white",
          WebkitTextStroke: "3px black",
          paintOrder: "stroke fill",
          filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))",
          marginBottom: 10, 
          lineHeight: 1.2,
          padding: '0 40px',
          opacity: isInstrumental ? 0.8 : 1 // Dim the ♫ slightly
        }}
      >
        {text}
      </div>

      {/* Only show the progress bar if it's NOT instrumental */}
      {!isInstrumental && (
        <div style={{
          width: '60%', 
          height: 6,
          backgroundColor: 'rgba(255,255,255,0.2)',
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: '#00b7ff',
            boxShadow: '0 0 10px #00b7ff'
          }} />
        </div>
      )}
    </div>
  );
};

export default function Music(props: z.infer<typeof DefaultSchema>) {
  const music =
    process.env.REMOTION_USE_LOCAL_DIR === "yes"
      ? staticFile("music.mp3")
      : `https://sebelasempat.hitam.id/api/ytMusic/${encodeURIComponent(props.musicTitle)}`;
  
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const duration = frame / fps;

  // --- Logic for Karaoke Timing ---
  const currentLineIndex = props.syncronizeLyrics.findIndex((a, i) => {
    const nextLine = props.syncronizeLyrics[i + 1];
    return duration >= a.start && (!nextLine || duration < nextLine.start);
  });
  
  const currentLyricObj = currentLineIndex !== -1 ? props.syncronizeLyrics[currentLineIndex] : null;
  const nextLyricObj = props.syncronizeLyrics[currentLineIndex + 1];
  
  // Text Handling
  let rawText = currentLyricObj?.text || "♫";
  // Check if text implies instrumental (empty, space, or explicitly '♫')
  const isInstrumental = rawText === "" || rawText === " " || rawText === "♫";
  const currentLyrics = isInstrumental ? "♫" : rawText;
  
  const previousLyrics = props.syncronizeLyrics[currentLineIndex - 1]?.text || "";
  const nextLyrics = nextLyricObj?.text || "";

  // Progress Calculation
  const startTime = currentLyricObj?.start || 0;
  const nextLineStart = nextLyricObj?.start || (startTime + 5); 
  const lineDuration = nextLineStart - startTime;
  
  const rawProgress = ((duration - startTime) / lineDuration) * 100;
  const lyricProgress = Math.min(100, Math.max(0, rawProgress));

  // --- Instrumental / Countdown Logic ---
  const timeUntilNextLine = nextLineStart - duration;

  // STRICT CONDITION: 
  // 1. Must be instrumental ("♫")
  // 2. Must be within 3 seconds of the NEXT line starting
  const showCountdown = isInstrumental && timeUntilNextLine <= 3 && timeUntilNextLine > 0;

  // --- Translation Logic ---
  const translateLyricsOnCurrentDuration = props.translateSyncronizeLyrics.filter(
    (a) => duration >= a.start
  );
  let translateCurrentLyrics =
    translateLyricsOnCurrentDuration.slice(-1)[0]?.text || "";

  // Hide translation if it's instrumental
  if (isInstrumental) {
      translateCurrentLyrics = "";
  }

  // --- Audio Data ---
  const audioData = useAudioData(music);
  const ytmMusicInfoRef = useRef<HTMLDivElement>(null);
  const [ytmMusicInfoWidth, setYtmMusicInfoWidth] = useState(0);
  const scale = useCurrentScale();

  useLayoutEffect(() => {
    if (!ytmMusicInfoRef.current) return;
    setYtmMusicInfoWidth(
      ytmMusicInfoRef.current.getBoundingClientRect().width / scale
    );
  }, [scale, audioData]);

  // Animation: Gentle pulse for instrumental, standard scale for lyrics
  const currentLyricsAnimation = useMemo(() => {
    const animation: Animation[] = [];
    props.syncronizeLyrics.forEach((a) => {
      const start = a.start * fps;
      animation.push(
        Scale({ by: 1, initial: 0.8, start, duration: 8, initialZ: 1 }) 
      );
    });
    return animation;
  }, [props.syncronizeLyrics, fps]);

  const currentTranslateLyricsAnimation = useMemo(() => {
    const animation: Animation[] = [];
    props.translateSyncronizeLyrics.forEach((a) => {
      const start = a.start * fps;
      animation.push(
        Scale({ by: 1, initial: 0.8, start, duration: 10, initialZ: 1 })
      );
    });
    return animation;
  }, [props.translateSyncronizeLyrics, fps]);

  const currentTimeDuration = `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(Math.floor(duration % 60)).padStart(2, "0")}`;
  const totalDuration = `${String(Math.floor(durationInFrames / fps / 60)).padStart(2, "0")}:${String(Math.floor((durationInFrames / fps) % 60)).padStart(2, "0")}`;

  if (!audioData) return null;
  const visualization = normalizeAudioData({
    audioData,
    fps,
    frame,
  });

  return (
    <>
      <Audio src={music} />
      <AbsoluteFill
        style={{
          backgroundColor: "#111",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Background & Overlay */}
        <AbsoluteFill style={{ opacity: 0.5 }}>
          {typeof props.background === "string" ? (
            <Img
              src={
                process.env.REMOTION_USE_LOCAL_DIR === "yes"
                  ? getStaticFiles().find((a) => a.name.startsWith("background"))!.src
                  : props.background
              }
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          ) : (
            <LoopableOffthreadVideo
              muted
              loop
              src={
                process.env.REMOTION_USE_LOCAL_DIR === "yes"
                  ? getStaticFiles().find((a) => a.name.startsWith("background"))!.src
                  : props.background.video
              }
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          )}
        </AbsoluteFill>
        
        <AbsoluteFill
          style={{
            backdropFilter: "blur(3px)",
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.9) 100%)",
          }}
        />

        {/* --- Top Left Info --- */}
        <div style={{ zIndex: 999, position: "absolute", top: 50, left: 50 }}>
             <Animated
            animations={[
              Move({ y: 0, initialY: -250, duration: fps * 3 }),
              Move({ y: -250, start: fps * 10, duration: fps * 2 }),
            ]}
          >
             <Img
                src={
                  process.env.REMOTION_USE_LOCAL_DIR === "yes"
                    ? getStaticFiles().find((a) => a.name.startsWith("ytThumb"))!.src
                    : `https://sebelasempat.hitam.id/api/ytm/thumbnail?url=${encodeURIComponent(props.ytmThumbnail)}`
                }
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 100,
                  border: "3px solid white",
                }}
              />
              <div
                  ref={ytmMusicInfoRef}
                  style={{
                    color: "#ffffffc7",
                    fontSize: 24,
                    marginTop: 10,
                    fontFamily: universalFontFamily,
                    fontWeight: "bold",
                    maxWidth: 300,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {props.ytmMusicInfo}
                </div>
          </Animated>
        </div>

        {/* --- Previous Lyrics (Context) --- */}
        {!isInstrumental && (
            <div
            style={{
                position: "absolute",
                top: "32%", 
                fontSize: 30,
                fontWeight: "bold",
                textAlign: "center",
                opacity: 0.4,
                color: "#aaa",
                fontFamily: universalFontFamily,
                width: '80%'
            }}
            >
            {previousLyrics}
            </div>
        )}

        {/* --- Instrumental Countdown --- */}
        {showCountdown && <CountdownIndicator timeUntilNext={timeUntilNextLine} />}

        {/* --- Main Lyrics + Bar Indicator --- */}
        <Animated 
            animations={currentLyricsAnimation} 
            style={{ 
                zIndex: 1000, 
                width: '100%', 
                display: 'flex', 
                justifyContent: 'center',
                position: 'absolute',
                top: '42%' 
            }}
        >
          <LyricWithBar 
            text={currentLyrics} 
            progress={lyricProgress} 
            fontFamily={universalFontFamily} 
            isInstrumental={isInstrumental}
          />
        </Animated>

        {/* --- Next Lyrics (Context) --- */}
        {!isInstrumental && (
            <div
            style={{
                position: "absolute",
                top: "65%",
                fontSize: 35,
                fontWeight: "bold",
                textAlign: "center",
                opacity: 0.5,
                color: "#ccc",
                fontFamily: universalFontFamily,
                width: '80%'
            }}
            >
            {nextLyrics}
            </div>
        )}

        {/* --- Translation --- */}
        <Animated
          absolute
          animations={currentTranslateLyricsAnimation}
          style={{
            fontSize: 38,
            fontWeight: "500",
            fontStyle: "italic",
            textShadow: "0 2px 4px rgba(0,0,0,0.8)", 
            color: "#ffca28",
            position: "absolute",
            bottom: 200,
            zIndex: 999,
            width: "100%",
            textAlign: "center",
            fontFamily: universalFontFamily,
          }}
        >
          {translateCurrentLyrics}
        </Animated>

        {/* --- Visualizer --- */}
        <div
          style={{
            height: 100,
            alignItems: "flex-end",
            display: "flex",
            justifyContent: "center",
            flexDirection: "row",
            gap: 6,
            position: "absolute",
            bottom: 80,
            width: '100%'
          }}
        >
          {visualization.map((a, i) => {
            const height = interpolate(a, [0, 1], [5, 60], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const hue = interpolate(a, [0, 1], [180, 220], { 
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  height: `${height}px`,
                  width: 2,
                  backgroundColor: `hsla(${hue}, 80%, 60%, 0.6)`,
                  borderRadius: "4px",
                }}
              />
            );
          })}
        </div>

        {/* --- Bottom Progress Bar (Duration) --- */}
        <div
          style={{
            position: "absolute",
            bottom: 30,
            width: "80%",
            maxWidth: 1000,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: "bold", fontFamily: "monospace", color: "white" }}>
            {currentTimeDuration}
          </div>
          <div
            style={{
              flex: 1,
              height: 6,
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              borderRadius: 3,
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(frame / durationInFrames) * 100}%`,
                backgroundColor: "#00b7ff",
                borderRadius: 3,
                position: "absolute",
              }}
            />
          </div>
          <div style={{ fontSize: 20, fontWeight: "bold", fontFamily: "monospace", color: "white" }}>
            {totalDuration}
          </div>
        </div>
      </AbsoluteFill>
    </>
  );
}