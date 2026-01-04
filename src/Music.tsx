import { useAudioData } from "@remotion/media-utils";
import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  getStaticFiles,
  Img,
  interpolate,
  interpolateColors,
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

// --- HELPER: VTT PARSER UTILS ---

type VttWord = {
  word: string;
  start: number;
  end: number;
};

// Tipe data internal untuk Line yang sudah diproses
type ProcessedLine = {
  start: number;
  end: number;
  text: string;
  words: VttWord[];
  isInstrumental: boolean;
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

const parseVttSegments = (vttString: string): ProcessedLine[] => {
  const lines = vttString.split("\n");
  const result: ProcessedLine[] = [];

  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  const blockTimeRegex =
    /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s-->\s((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;
  const inlineTimeRegex = /<((?:\d{2}:)?\d{2}:\d{2}\.\d{3})>/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "WEBVTT" || line === "") continue;

    const timeMatch = line.match(blockTimeRegex);
    if (timeMatch) {
      currentStart = parseTime(timeMatch[1]);
      currentEnd = parseTime(timeMatch[2]);
    } else if (currentStart !== null && currentEnd !== null) {
      const rawText = line;
      const cleanText = rawText.replace(/<[^>]+>/g, "").trim();

      if (cleanText) {
        const words: VttWord[] = [];
        const parts = rawText.split(inlineTimeRegex);

        let currentWordStart = currentStart;

        for (let j = 0; j < parts.length; j += 2) {
          const wordText = parts[j].trim();
          const nextTimestampStr = parts[j + 1];

          let thisWordEnd = currentEnd;
          if (nextTimestampStr) {
            thisWordEnd = parseTime(nextTimestampStr);
          }

          if (wordText) {
            words.push({
              word: wordText,
              start: currentWordStart,
              end: thisWordEnd,
            });
          }
          currentWordStart = thisWordEnd;
        }

        result.push({
          start: currentStart,
          end: currentEnd,
          text: cleanText,
          words: words,
          isInstrumental: false,
        });
      }
      currentStart = null;
      currentEnd = null;
    }
  }
  return result;
};

// --- TYPES ---
type ExtendedProps = z.infer<typeof DefaultSchema> & {
  wordByWordLyrics: string;
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
      <div style={{ display: "flex", gap: 20, flex: 1 }}>
        {[3, 2, 1].map((num) => {
          const startFrame = targetFrame - num * fps;
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

  // Hanya tampilkan Not Musik jika benar-benar Instrumental (berasal dari JSON)
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
              Scale({ start: startFrame, duration: 5, by: 1.02 }),
              Scale({ start: endFrame, duration: 5, by: 1 / 1.02 }),
            ]}
            style={{
              display: "inline-block",
              margin: "0 5px",
              fontFamily: fontFamily,
              fontSize: 70,
              fontWeight: 900,
              color: !isStarted || isEnded ? "#ffffffb7" : "#00b7ff",
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
  const duration = frame / fps;

  // --- 1. MEMPROSES LIRIK ---
  const processedLyrics = useMemo(() => {
    // A. Parse VTT sebagai sumber lirik utama
    const sungLines = parseVttSegments(props.wordByWordLyrics);

    // B. Parse JSON HANYA untuk mengambil bagian hening (Instrumental)
    const syncLyrics = props.syncronizeLyrics || [];
    const instrumentalLines: ProcessedLine[] = syncLyrics
      .filter((line) => !line.text || line.text.trim() === "")
      .map((line) => ({
        start: line.start,
        // End sementara, nanti diperbaiki
        end: line.start + 5,
        text: "",
        words: [],
        isInstrumental: true,
      }));

    // C. Gabungkan keduanya dan urutkan waktu
    const allLines = [...sungLines, ...instrumentalLines].sort(
      (a, b) => a.start - b.start,
    );

    // D. FILL GAPS (PENTING):
    // Kita memanjangkan durasi lirik agar bertemu dengan lirik berikutnya
    return allLines.map((line, index) => {
      const nextLine = allLines[index + 1];

      // Jika ada baris selanjutnya
      if (nextLine) {
        return {
          ...line,
          end: nextLine.start,
        };
      }
      // Baris terakhir
      return line;
    });
  }, [props.wordByWordLyrics, props.syncronizeLyrics]);

  // --- 2. LOGIKA POSISI AKTIF & NAVIGASI (DIPERBAIKI) ---
  
  const activeLineIndex = processedLyrics.findIndex(
    (line) => duration >= line.start && duration < line.end,
  );

  const currentLine =
    activeLineIndex !== -1 ? processedLyrics[activeLineIndex] : null;
  const previousLine = processedLyrics[activeLineIndex - 1];

  // FIX UTAMA #1 (Akhir Lagu): Menentukan nextLine dengan benar
  // Jika activeLineIndex -1 (gap/akhir), cari baris yang startnya > duration.
  // Jika activeLineIndex normal, ambil index + 1.
  let nextLine: ProcessedLine | undefined;
  
  if (activeLineIndex !== -1) {
    nextLine = processedLyrics[activeLineIndex + 1];
  } else {
    // Sedang dalam gap (intro/outro/instrumental gap yang tidak tertutup fill gap)
    nextLine = processedLyrics.find(l => l.start > duration);
  }

  // Definisi Global Instrumental
  const isGlobalInstrumental = currentLine ? currentLine.isInstrumental : false;

  // --- 3. COUNTDOWN LOGIC ---
  let timeUntilNextLine = 0;
  let nextLyricsText = "";
  let targetCountdownFrame = 0;
  let showCountdown = false;

  // Countdown aktif hanya jika kita berada di dalam baris Instrumental
  if (isGlobalInstrumental && nextLine) {
    timeUntilNextLine = nextLine.start - duration;
    nextLyricsText = nextLine.text;
    targetCountdownFrame = nextLine.start * fps;

    if (timeUntilNextLine <= 3 && timeUntilNextLine > 0) {
      showCountdown = true;
    }
  }

  // --- 4. ANIMASI MASUK LIRIK ---
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

  // --- 5. VISUALIZATION ---
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

        {/* --- Context Previous Line --- */}
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

        {/* --- Countdown --- */}
        {showCountdown && (
          <CountdownIndicator
            targetFrame={targetCountdownFrame}
            nextText={nextLyricsText}
            fontFamily={universalFontFamily}
            fps={fps}
          />
        )}

        {/* --- Main Lyrics --- */}
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
          {/* FIX UTAMA #2 (Awal Lagu): Tidak ada lagi pengecualian untuk activeLineIndex === 0. 
              Semua baris dirender seragam menggunakan logika WordByWord standard. */}
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
            
            {/* Progress Bar per baris */}
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
        </Animated>

        {/* --- Context Next Line --- */}
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

        {/* --- Progress Bar Total --- */}
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