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
import normalizeAudioData from "./normalizeAudioData";
import { DefaultSchema } from "./Root";

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
  return (
    <div style={{
      position: 'absolute',
      top: '35%', // Positioned above the main lyric area
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      gap: 20
    }}>
      {[3, 2, 1].map((num) => {
        const isActive = timeUntilNext <= num;
        return (
          <div key={num} style={{
            width: 25,
            height: 25,
            borderRadius: '50%',
            backgroundColor: isActive ? '#00b7ff' : 'rgba(255,255,255,0.1)',
            boxShadow: isActive ? '0 0 20px #00b7ff' : 'none',
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
          fontSize: isInstrumental ? 100 : 65, // Larger ♫ symbol
          fontWeight: 900,
          textAlign: "center",
          color: "white",
          WebkitTextStroke: "3px black",
          paintOrder: "stroke fill",
          filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))",
          marginBottom: 15, 
          lineHeight: 1.3,
          padding: '0 20px',
          opacity: isInstrumental ? 0.8 : 1
        }}
      >
        {text}
      </div>

      {!isInstrumental && (
        <div style={{
          width: '80%', // Wider bar for portrait
          height: 8,
          backgroundColor: 'rgba(255,255,255,0.2)',
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: '#00b7ff',
            boxShadow: '0 0 15px #00b7ff'
          }} />
        </div>
      )}
    </div>
  );
};

export default function MusicPortrait(props: z.infer<typeof DefaultSchema>) {
  const music =
    process.env.REMOTION_USE_LOCAL_DIR === "yes"
      ? staticFile("music.mp3")
      : `https://sebelasempat.hitam.id/api/ytMusic/${encodeURIComponent(
          props.musicTitle,
        )}`;
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
  const showCountdown = isInstrumental && timeUntilNextLine <= 3 && timeUntilNextLine > 0;

  // --- Translation Logic ---
  const translateLyricsOnCurrentDuration =
    props.translateSyncronizeLyrics.filter((a) => duration >= a.start);
  let translateCurrentLyrics =
    translateLyricsOnCurrentDuration.slice(-1)[0]?.text || "";
  
  // Hide translation on instrumental
  if (isInstrumental) {
      translateCurrentLyrics = "";
  }

  const audioData = useAudioData(music);
  const ytmMusicInfoRef = useRef<HTMLDivElement>(null);
  const [ytmMusicInfoWidth, setYtmMusicInfoWidth] = useState(0);
  const scale = useCurrentScale();

  useLayoutEffect(() => {
    if (!ytmMusicInfoRef.current) return;
    setYtmMusicInfoWidth(
      ytmMusicInfoRef.current.getBoundingClientRect().width / scale,
    );
  }, [scale, audioData]);

  // Animation: Gentle pulse for current lyrics
  const currentLyricsAnimation = useMemo(() => {
    const animation: Animation[] = [];
    props.syncronizeLyrics.forEach((a) => {
      const start = a.start * fps;
      animation.push(
        Scale({ by: 1, initial: 0.85, start, duration: 10, initialZ: 1 })
      );
    });
    return animation;
  }, [props.syncronizeLyrics, fps]);

  const currentTranslateLyricsAnimation = useMemo(() => {
    const animation: Animation[] = [];
    props.translateSyncronizeLyrics.forEach((a) => {
      const start = a.start * fps;
      animation.push(Scale({ by: 1, initial: 0.8, start, duration: 10 }));
    });
    return animation;
  }, [props.translateSyncronizeLyrics, fps]);

  const currentTimeDuration = `${String(Math.floor(duration / 60)).padStart(
    2,
    "0",
  )}:${String(Math.floor(duration % 60)).padStart(2, "0")}`;
  const totalDuration = `${String(
    Math.floor(durationInFrames / fps / 60),
  ).padStart(2, "0")}:${String(
    Math.floor((durationInFrames / fps) % 60),
  ).padStart(2, "0")}`;

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
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        {/* Background */}
        <AbsoluteFill style={{ opacity: 0.5 }}>
          {typeof props.background === "string" ? (
            <Img
              src={
                process.env.REMOTION_USE_LOCAL_DIR === "yes"
                  ? getStaticFiles().find((a) =>
                      a.name.startsWith("background"),
                    )!.src
                  : props.background
              }
              style={{
                objectFit: "cover",
                width: "100%",
                height: "100%",
              }}
            />
          ) : (
            <LoopableOffthreadVideo
              muted
              loop
              src={
                process.env.REMOTION_USE_LOCAL_DIR === "yes"
                  ? getStaticFiles().find((a) =>
                      a.name.startsWith("background"),
                    )!.src
                  : props.background.video
              }
              style={{
                objectFit: "cover",
                width: "100%",
                height: "100%",
              }}
            />
          )}
        </AbsoluteFill>

        {/* Overlay */}
        <AbsoluteFill
          style={{
            backdropFilter: "blur(3px)",
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.8) 100%)",
          }}
        />

        {/* Thumbnail & Title (Top) */}
        <div
          style={{
            position: "absolute",
            top: 100,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 20,
          }}
        >
          <Animated
            animations={[
              Rotate({ degrees: 360, duration: fps * 6, ease: Ease.Linear }),
            ]}
          >
            <Img
              src={
                process.env.REMOTION_USE_LOCAL_DIR === "yes"
                  ? getStaticFiles().find((a) => a.name.startsWith("ytThumb"))!
                      .src
                  : `https://sebelasempat.hitam.id/api/ytm/thumbnail?url=${encodeURIComponent(
                      props.ytmThumbnail,
                    )}`
              }
              style={{
                width: 180,
                height: 180,
                borderRadius: "50%",
                border: "6px solid white",
              }}
            />
          </Animated>
          <div
            ref={ytmMusicInfoRef}
            style={{
              color: "white",
              fontSize: 32,
              fontWeight: "bold",
              fontFamily: universalFontFamily,
              opacity: 0.9,
              width: "85%",
              lineHeight: 1.3,
              textShadow: '0 2px 4px rgba(0,0,0,0.5)'
            }}
          >
            {props.ytmMusicInfo}
          </div>
        </div>

        {/* --- LYRICS SECTION --- */}

        {/* Previous Lyric */}
        {!isInstrumental && (
          <div
            style={{
              position: 'absolute',
              top: '38%',
              width: '90%',
              fontSize: 30,
              color: "#aaa",
              textAlign: 'center',
              fontWeight: 'bold',
              fontFamily: universalFontFamily,
              opacity: 0.5
            }}
          >
            {previousLyrics}
          </div>
        )}

        {/* Instrumental Countdown Indicator */}
        {showCountdown && <CountdownIndicator timeUntilNext={timeUntilNextLine} />}

        {/* Main Lyric + Bar */}
        <Animated 
          animations={currentLyricsAnimation}
          style={{
            position: 'absolute',
            top: '40%',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 10
          }}
        >
          <LyricWithBar 
            text={currentLyrics}
            progress={lyricProgress}
            fontFamily={universalFontFamily}
            isInstrumental={isInstrumental}
          />
        </Animated>

        {/* Next Lyric */}
        {!isInstrumental && (
          <div
            style={{
              position: 'absolute',
              top: '60%',
              width: '90%',
              fontSize: 35,
              color: "#ccc",
              textAlign: 'center',
              fontWeight: 'bold',
              fontFamily: universalFontFamily,
              opacity: 0.6
            }}
          >
            {nextLyrics}
          </div>
        )}

        {/* Translation */}
        <Animated
          animations={currentTranslateLyricsAnimation}
          style={{
            position: "absolute",
            bottom: 320,
            width: "100%",
            textAlign: "center",
            fontSize: 40,
            fontStyle: "italic",
            textShadow: "0 2px 4px rgba(0,0,0,0.8)",
            color: "#ffca28",
            fontFamily: universalFontFamily,
            padding: '0 20px'
          }}
        >
          {translateCurrentLyrics}
        </Animated>

        {/* Audio Visualizer */}
        <div
          style={{
            position: "absolute",
            bottom: 120,
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            gap: 4,
            height: 100,
          }}
        >
          {visualization.map((a, i) => {
            const height = interpolate(a, [0, 1], [5, 80], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            const hue = interpolate(a, [0, 1], [180, 220], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const color = `hsl(${hue}, 80%, 60%)`;

            return (
              <div
                key={i}
                style={{
                  height: `${height}px`,
                  width: 4,
                  backgroundColor: `hsla(${hue}, 80%, 60%, 0.6)`,
                  borderRadius: "4px",
                }}
              />
            );
          })}
        </div>

        {/* Total Progress Bar */}
        <div
          style={{
            position: "absolute",
            bottom: 50,
            width: "85%",
            display: "flex",
            alignItems: "center",
            gap: 15,
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: "bold",
              opacity: 0.9,
              color: "white",
              fontFamily: 'monospace'
            }}
          >
            {currentTimeDuration}
          </div>
          <div
            style={{
              flex: 1,
              height: 8,
              backgroundColor: "rgba(255,255,255,0.2)",
              borderRadius: 4,
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(frame / durationInFrames) * 100}%`,
                backgroundColor: "#00b7ff",
                borderRadius: 4,
                position: "absolute",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: "bold",
              opacity: 0.9,
              color: "white",
              fontFamily: 'monospace'
            }}
          >
            {totalDuration}
          </div>
        </div>
      </AbsoluteFill>
    </>
  );
}