import { useAudioData } from "@remotion/media-utils";
import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  getStaticFiles,
  Img,
  interpolate,
  interpolateColors, // Added import
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Animated, Animation, Move, Scale } from "remotion-animated";
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

// --- HELPER: VTT PARSER (PURE FUNCTION) ---
// Fungsi ini murni: Input string -> Output Array, tanpa side effect.
type VttWord = {
  word: string;
  start: number;
  end: number;
};

const parseTime = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  let seconds = 0;
  if (parts.length === 3) {
    seconds += parseFloat(parts[0]) * 3600;
    seconds += parseFloat(parts[1]) * 60;
    seconds += parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds += parseFloat(parts[0]) * 60;
    seconds += parseFloat(parts[1]);
  }
  return seconds;
};

const parseWebVTT = (vttString: string): VttWord[] => {
  const lines = vttString.split("\n");
  const words: VttWord[] = [];

  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  const timeRegex =
    /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s-->\s((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "WEBVTT" || line === "") continue;

    const timeMatch = line.match(timeRegex);
    if (timeMatch) {
      currentStart = parseTime(timeMatch[1]);
      currentEnd = parseTime(timeMatch[2]);
    } else if (currentStart !== null && currentEnd !== null) {
      const cleanWord = line.replace(/<[^>]*>/g, "").trim();
      if (cleanWord) {
        words.push({
          word: cleanWord,
          start: currentStart,
          end: currentEnd,
        });
      }
      currentStart = null;
      currentEnd = null;
    }
  }
  return words;
};

// --- TYPES ---
type ExtendedProps = z.infer<typeof DefaultSchema> & {
  wordByWordLyrics: string;
};

type ProcessedLine = {
  start: number;
  end: number;
  text: string;
  words: VttWord[];
  isInstrumental: boolean;
};

// --- COMPONENT: Instrumental Countdown ---
const CountdownIndicator = ({
  targetFrame,
  nextText,
  fontFamily,
  fps,
}: {
  targetFrame: number;
  nextText: string;
  fontFamily: string;
  fps: number;
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        width: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 15,
      }}
    >
      {/* Titik Countdown */}
      <div style={{ display: "flex", gap: 20, flex: 1 }}>
        {[3, 2, 1].map((num) => {
          // Logic: Animate when frame reaches (targetFrame - num*fps)
          const startFrame = targetFrame - num * fps;

          // Color interpolation (replacement for CSS transition)
          const transitionDuration = 0.2 * fps;
          const progress = interpolate(
            frame,
            [startFrame, startFrame + transitionDuration],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );

          const backgroundColor = interpolateColors(
            progress,
            [0, 1],
            ["rgba(255,255,255,0.1)", "#00b7ff"],
          );
          const shadowColor = interpolateColors(
            progress,
            [0, 1],
            ["rgba(0,0,0,0)", "#00b7ff"],
          );
          const shadowSpread = interpolate(progress, [0, 1], [0, 15]);

          return (
            <Animated
              key={num}
              animations={[
                Scale({
                  start: startFrame,
                  duration: transitionDuration,
                  by: 1.3,
                  initial: 1,
                }),
              ]}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                backgroundColor: backgroundColor,
                boxShadow: `0 0 ${shadowSpread}px ${shadowColor}`,
              }}
            />
          );
        })}
      </div>
      {/* Teks Lirik Selanjutnya */}
      <div
        style={{
          fontFamily,
          fontSize: 40,
          fontWeight: "bold",
          color: "rgba(255,255,255,0.9)",
          opacity: 0.5,
          textAlign: "center",
          textShadow: "0 2px 10px rgba(0,0,0,0.8)",
          padding: "0 20px",
          maxWidth: "90%",
        }}
      >
        {nextText}
      </div>
    </div>
  );
};

// --- COMPONENT: Word By Word Lyric Renderer ---
const WordByWordLine = ({
  lineData,
  currentDuration,
  fontFamily,
  isHidden,
  fps,
}: {
  lineData: ProcessedLine | null;
  currentDuration: number;
  fontFamily: string;
  isHidden?: boolean;
  fps: number;
}) => {
  if (isHidden) return null;

  if (!lineData || lineData.isInstrumental) {
    return (
      <div
        style={{
          fontFamily: fontFamily,
          fontSize: 90,
          fontWeight: 900,
          textAlign: "center",
          color: "white",
          WebkitTextStroke: "3px black",
          filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))",
          opacity: 0.8,
        }}
      >
        ♫
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        width: "100%",
        padding: "0 40px",
        // columnGap: '12px', // Removed to handle spacing via margin in Animated
        rowGap: "4px",
      }}
    >
      {lineData.words.map((wordObj, index) => {
        const startFrame = wordObj.start * fps;
        const endFrame = wordObj.end * fps;
        const isStarted = currentDuration >= wordObj.start;
        const isEnded = currentDuration >= wordObj.end;

        return (
          <Animated
            key={`${index}_${wordObj.start}`}
            animations={[
              // Scale up when word starts
              Scale({ start: startFrame, duration: 5, by: 1.02 }), // Reduced from 1.1 to 1.02
              // Scale down when word ends (return to normal)
              Scale({ start: endFrame, duration: 5, by: 1 / 1.02 }),
            ]}
            style={{
              display: "inline-block",
              margin: "0 5px", // Added margin to prevent crowding ("dempet")
              fontFamily: fontFamily,
              fontSize: 70,
              fontWeight: 900,

              color: !isStarted || isEnded ? "#ffffffb7" : "#00b7ff",
              // WebkitBackgroundClip: "text",
              // WebkitTextFillColor: "transparent",

              WebkitTextStroke: "2px black",

              paintOrder: "stroke fill",
              filter: "drop-shadow(0 4px 4px rgba(0,0,0,0.8))",
            }}
          >
            {wordObj.word}
          </Animated>
        );
      })}
    </div>
  );
};

export default function Music(props: ExtendedProps) {
  const music =
    process.env.REMOTION_USE_LOCAL_DIR === "yes"
      ? staticFile("music.mp3")
      : `https://sebelasempat.hitam.id/api/ytMusic/${encodeURIComponent(props.musicTitle)}`;

  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const duration = frame / fps; // Waktu dalam detik, state utama kita

  // --- 1. MEMPROSES LIRIK (PURE & MEMOIZED) ---
  const processedLyrics = useMemo(() => {
    // Parsing VTT (Stateless)
    const vttWords = parseWebVTT(props.wordByWordLyrics);

    const result: ProcessedLine[] = [];
    const syncLyrics = props.syncronizeLyrics || [];

    for (let i = 0; i < syncLyrics.length; i++) {
      const currentLine = syncLyrics[i];
      const nextLine = syncLyrics[i + 1];

      const lineStart = currentLine.start;
      const lineEnd = nextLine ? nextLine.start : lineStart + 5;

      const isInstrumental = currentLine.text.trim() === "";

      let currentLineText = currentLine.text.toLowerCase();
      const wordsInThisLine = vttWords.filter((w) => {
        if (
          currentLineText.includes(w.word.toLowerCase()) &&
          w.start >= lineStart - 2 &&
          w.end <= lineEnd + 2
        ) {
          currentLineText = currentLineText
            .replace(w.word.toLowerCase().trim(), "")
            .trim();
          return true;
        }
        return false;
      });

      wordsInThisLine.forEach((w) => {
        const index = vttWords.indexOf(w);
        if (index > -1) vttWords.splice(index, 1);
      });

      result.push({
        start: lineStart,
        end: lineEnd,
        text: currentLine.text,
        words: wordsInThisLine,
        isInstrumental,
      });
    }
    return result;
  }, [props.wordByWordLyrics, props.syncronizeLyrics]);

  // --- 2. LOGIKA POSISI AKTIF (FRAME BASED) ---
  const activeLineIndex = processedLyrics.findIndex(
    (line) => duration >= line.start && duration < line.end,
  );

  const currentLine =
    activeLineIndex !== -1 ? processedLyrics[activeLineIndex] : null;
  const nextLine = processedLyrics[activeLineIndex + 1];
  const previousLine = processedLyrics[activeLineIndex - 1];

  const isGlobalInstrumental = !currentLine || currentLine.isInstrumental;

  // --- 3. COUNTDOWN LOGIC ---
  let timeUntilNextLine = 0;
  let nextLyricsText = "";
  let targetCountdownFrame = 0;

  if (isGlobalInstrumental) {
    if (activeLineIndex === -1) {
      // Gap sebelum lagu mulai / di tengah lagu
      const upcomingLine = processedLyrics.find((l) => l.start > duration);
      if (upcomingLine) {
        timeUntilNextLine = upcomingLine.start - duration;
        nextLyricsText = upcomingLine.text;
        targetCountdownFrame = upcomingLine.start * fps;
      }
    } else if (nextLine) {
      // Instrumental tapi masih dalam blok waktu baris kosong
      timeUntilNextLine = nextLine.start - duration;
      nextLyricsText = nextLine.text;
      targetCountdownFrame = nextLine.start * fps;
    }
  }

  const showCountdown =
    isGlobalInstrumental && timeUntilNextLine <= 3 && timeUntilNextLine > 0;

  // --- 4. ANIMASI MASUK LIRIK (POP-IN) ---
  const currentLyricsAnimation = useMemo(() => {
    const animation: Animation[] = [];
    processedLyrics.forEach((line) => {
      if (!line.isInstrumental) {
        const start = line.start * fps;
        animation.push(
          Scale({ by: 1, initial: 0.8, start, duration: 8, initialZ: 1 }),
        );
      }
    });
    return animation;
  }, [processedLyrics, fps]);

  const currentTimeDuration = `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(Math.floor(duration % 60)).padStart(2, "0")}`;
  const totalDuration = `${String(Math.floor(durationInFrames / fps / 60)).padStart(2, "0")}:${String(Math.floor((durationInFrames / fps) % 60)).padStart(2, "0")}`;

  // --- 5. AUDIO VISUALIZATION ---
  const audioData = useAudioData(music);
  if (!audioData) return null;
  const visualization = normalizeAudioData({ audioData, frame, fps });

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
                  ? getStaticFiles().find((a) =>
                      a.name.startsWith("background"),
                    )!.src
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
                  ? getStaticFiles().find((a) =>
                      a.name.startsWith("background"),
                    )!.src
                  : props.background.video
              }
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          )}
        </AbsoluteFill>

        <AbsoluteFill
          style={{
            backdropFilter: "blur(3px)",
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.9) 100%)",
          }}
        />

        {/* --- Info Lagu --- */}
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
                  ? getStaticFiles().find((a) => a.name.startsWith("ytThumb"))!
                      .src
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
              style={{
                color: "#ffffffc7",
                fontSize: 24,
                marginTop: 10,
                fontFamily: universalFontFamily,
                fontWeight: "bold",
                maxWidth: 300,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {props.ytmMusicInfo}
            </div>
          </Animated>
        </div>

        {/* --- Baris Sebelumnya (Context) --- */}
        {!isGlobalInstrumental &&
          previousLine &&
          !previousLine.isInstrumental && (
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
                width: "80%",
              }}
            >
              {previousLine.text}
            </div>
          )}

        {/* --- Countdown (dengan Lirik Selanjutnya) --- */}
        {showCountdown && (
          <CountdownIndicator
            targetFrame={targetCountdownFrame}
            nextText={nextLyricsText}
            fontFamily={universalFontFamily}
            fps={fps}
          />
        )}

        {/* --- Lirik Utama (Word By Word) --- */}
        <Animated
          animations={currentLyricsAnimation}
          style={{
            zIndex: 1000,
            width: "100%",
            display: "flex",
            justifyContent: "center",
            position: "absolute",
            top: "42%",
          }}
        >
          {activeLineIndex === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 20,
              }}
            >
              <div
                style={{
                  fontFamily: universalFontFamily,
                  fontSize: 90,
                  fontWeight: 900,
                  textAlign: "center",
                  color: "white",
                  WebkitTextStroke: "3px black",
                  filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))",
                  opacity: 0.8,
                }}
              >
                {currentLine?.text}
              </div>
              <div
                style={{
                  width: "70vw",
                  height: "6px",
                  marginTop: "20px",
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  borderRadius: "3px",
                }}
              >
                <div
                  style={{
                    height: "6px",
                    width: `${(frame / (nextLine.start * fps)) * 100}%`,
                    backgroundColor: "#00b7ff",
                    borderRadius: "3px",
                  }}
                ></div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 20,
              }}
            >
              <WordByWordLine
                lineData={currentLine}
                currentDuration={duration}
                fontFamily={universalFontFamily}
                isHidden={showCountdown}
                fps={fps}
              />
              <div
                style={{
                  display: isGlobalInstrumental ? "none" : "block",
                  width: "60vw",
                  height: 6,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderRadius: 3,
                  overflow: "hidden",
                  boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, (duration - (currentLine?.start ?? 0)) / ((nextLine?.start ?? 0) - (currentLine?.start ?? 0))) * 100)}%`,
                    height: "100%",
                    backgroundColor: "#00b7ff",
                    boxShadow: "0 0 10px #00b7ff",
                  }}
                ></div>
              </div>
            </div>
          )}
        </Animated>

        {/* --- Baris Berikutnya (Context) --- */}
        {!isGlobalInstrumental &&
          !showCountdown &&
          nextLine &&
          !nextLine.isInstrumental && (
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
                width: "80%",
              }}
            >
              {nextLine.text}
            </div>
          )}

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
            width: "100%",
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

        {/* --- Progress Bar --- */}
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
          <div
            style={{
              fontSize: 20,
              fontWeight: "bold",
              fontFamily: "monospace",
              color: "white",
            }}
          >
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
          <div
            style={{
              fontSize: 20,
              fontWeight: "bold",
              fontFamily: "monospace",
              color: "white",
            }}
          >
            {totalDuration}
          </div>
        </div>
      </AbsoluteFill>
    </>
  );
}
