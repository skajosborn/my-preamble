import React, { useState, useEffect, useRef } from "react";

const PREAMBLE =
  'We the People, in Order to form a more perfect Union, establish Justice, insure domestic Tranquility, provide for the common defence, promote the general Welfare, and secure the Blessings of Liberty to ourselves and our Posterity, do ordain and establish this Constitution for the United States of America.';

const words = PREAMBLE.split(" ");

export default function PreambleAnalyzer() {
  const playerRef = useRef(null);
  const containerRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(-1);
  const [startsWithTCount, setStartsWithTCount] = useState(0);
  const [endsWithECount, setEndsWithECount] = useState(0);
  const [doesBothCount, setDoesBothCount] = useState(0);

  const [loopRunning, setLoopRunning] = useState(false);

  const [isManualMode, setIsManualMode] = useState(false);
  const [manualIndex, setManualIndex] = useState(-1);

  const [isPausedAtTranquility, setIsPausedAtTranquility] = useState(false);

  // Track which words have been counted to avoid double-counting
  const countedWordsRef = useRef(new Set());
  const pauseStartTimeRef = useRef(null);
  const hasPausedAtTranquilityRef = useRef(false);
  const lastIndexRef = useRef(-1);

  // --- YouTube Player Setup ---
  useEffect(() => {
    if (!containerRef.current) return;

    function onYouTubeIframeAPIReady() {
      try {
        if (!window.YT || !window.YT.Player) {
          console.error("YouTube API not available");
          return;
        }

        const player = new window.YT.Player(containerRef.current, {
          videoId: "8_NzZvdsbWI",
          events: {
            onReady: (event) => {
              const readyPlayer = event.target;

              // verify methods exist
              if (
                readyPlayer &&
                typeof readyPlayer.seekTo === "function" &&
                typeof readyPlayer.playVideo === "function" &&
                typeof readyPlayer.getCurrentTime === "function"
              ) {
                playerRef.current = readyPlayer;
                setReady(true);
                setDuration(readyPlayer.getDuration());
              } else {
                console.error("YouTube player methods not available on ready");
              }
            },

            onStateChange: (event) => {
              // stop if ended
              if (event.data === window.YT.PlayerState.ENDED) {
                setLoopRunning(false);
                setCurrentIndex(words.length - 1);
                return;
              }

              /**
               * ✅ IMPORTANT FIX:
               * Don't stop the loop when we PAUSE on purpose at "Tranquility".
               * Use the ref, not React state (state update is async).
               */
              if (
                event.data === window.YT.PlayerState.PAUSED &&
                !hasPausedAtTranquilityRef.current
              ) {
                setLoopRunning(false);
              }
            },

            onError: (event) => {
              console.error("YouTube player error:", event.data);
            },
          },
        });

        // set ref immediately (safe)
        playerRef.current = player;
      } catch (error) {
        console.error("Error creating YouTube player:", error);
      }
    }

    // if API already loaded
    if (window.YT && window.YT.Player) {
      onYouTubeIframeAPIReady();
    } else {
      window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
    }
  }, []);

  // --- VIDEO SYNC LOOP ---
  useEffect(() => {
    if (!loopRunning || !playerRef.current || !duration || isManualMode || !ready) return;

    let animationFrameId;

    const update = () => {
      if (!playerRef.current || typeof playerRef.current.getCurrentTime !== "function") {
        return;
      }

      try {
        const currentTime = playerRef.current.getCurrentTime();

        const startOffset = 60.0;      // preamble starts ~ 1:00
        const preambleEndTime = 90.0;  // adjust as needed

        if (currentTime < startOffset) {
          animationFrameId = requestAnimationFrame(update);
          return;
        }

        if (currentTime > preambleEndTime) {
          setCurrentIndex(words.length - 1);
          animationFrameId = requestAnimationFrame(update);
          return;
        }

        const preambleDuration = preambleEndTime - startOffset;
        const effectiveTime = currentTime - startOffset;
        const progress = Math.min(effectiveTime / preambleDuration, 1.0);

        const easingFactor = 1.15;
        const easedProgress = progress < 1 ? Math.pow(progress, easingFactor) : progress;

        const index = Math.floor(easedProgress * words.length);

        // If paused at tranquility, keep highlighting it
        if (isPausedAtTranquility) {
          const tranquilityIndex = words.findIndex(
            (w) => w.toLowerCase().replace(/[.,]/g, "") === "tranquility"
          );
          if (tranquilityIndex >= 0) setCurrentIndex(tranquilityIndex);
          animationFrameId = requestAnimationFrame(update);
          return;
        }

        // advance index when it changes
        if (index !== lastIndexRef.current && index >= 0 && index < words.length) {
          const rawWord = words[index].toLowerCase();
          const cleanWord = rawWord.replace(/[.,]/g, "");

          // Pause briefly at Tranquility once
          if (cleanWord === "tranquility" && !hasPausedAtTranquilityRef.current) {
            hasPausedAtTranquilityRef.current = true; // set ref FIRST (important!)
            setIsPausedAtTranquility(true);
            pauseStartTimeRef.current = currentTime;

            lastIndexRef.current = index;
            setCurrentIndex(index);

            try {
              if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
                playerRef.current.pauseVideo();
              }
            } catch (error) {
              console.error("Error pausing video:", error);
            }

            setTimeout(() => {
              try {
                if (playerRef.current) {
                  const pausedTime =
                    pauseStartTimeRef.current || playerRef.current.getCurrentTime();

                  // nudge forward slightly to get past the word timing
                  playerRef.current.seekTo(pausedTime + 0.3, true);

                  // clear pause state before resuming
                  setIsPausedAtTranquility(false);
                  pauseStartTimeRef.current = null;

                  setTimeout(() => {
                    if (playerRef.current && typeof playerRef.current.playVideo === "function") {
                      playerRef.current.playVideo();
                    }
                  }, 50);
                }
              } catch (error) {
                console.error("Error resuming video:", error);
                setIsPausedAtTranquility(false);
                pauseStartTimeRef.current = null;
              }
            }, 1000); // ✅ pause for 1 second (you said you wanted ~1s)

            animationFrameId = requestAnimationFrame(update);
            return;
          }

          lastIndexRef.current = index;
          setCurrentIndex(index);

          // Count each word once
          const wordKey = `${index}-${cleanWord}`;
          if (!countedWordsRef.current.has(wordKey)) {
            countedWordsRef.current.add(wordKey);

            if (cleanWord.startsWith("t")) setStartsWithTCount((p) => p + 1);
            if (cleanWord.endsWith("e")) setEndsWithECount((p) => p + 1);
            if (cleanWord.startsWith("t") && cleanWord.endsWith("e")) setDoesBothCount((p) => p + 1);
          }
        }

        animationFrameId = requestAnimationFrame(update);
      } catch (error) {
        console.error("Error in video sync loop:", error);
        setLoopRunning(false);
      }
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [loopRunning, duration, isManualMode, ready, isPausedAtTranquility]);

  // --- MANUAL MODE LOOP ---
  useEffect(() => {
    if (!isManualMode || loopRunning) return;

    if (manualIndex >= words.length - 1) {
      setIsManualMode(false);
      return;
    }

    const timer = setTimeout(() => {
      setManualIndex((prev) => {
        const nextIndex = prev + 1;

        if (nextIndex < words.length) {
          const cleanWord = words[nextIndex].toLowerCase().replace(/[.,]/g, "");

          if (cleanWord.startsWith("t")) setStartsWithTCount((p) => p + 1);
          if (cleanWord.endsWith("e")) setEndsWithECount((p) => p + 1);
          if (cleanWord.startsWith("t") && cleanWord.endsWith("e")) setDoesBothCount((p) => p + 1);
        }

        return nextIndex;
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [isManualMode, manualIndex, loopRunning]);

  // --- BUTTON HANDLERS ---
  const resetAll = () => {
    setStartsWithTCount(0);
    setEndsWithECount(0);
    setDoesBothCount(0);

    setCurrentIndex(-1);
    setManualIndex(-1);

    countedWordsRef.current.clear();
    setIsPausedAtTranquility(false);
    pauseStartTimeRef.current = null;
    hasPausedAtTranquilityRef.current = false;
    lastIndexRef.current = -1;
  };

  const handleStartWithVideo = () => {
    if (!playerRef.current || !ready) return;
    if (typeof playerRef.current.seekTo !== "function" || typeof playerRef.current.playVideo !== "function") {
      console.warn("YouTube player methods not available");
      return;
    }

    resetAll();
    setIsManualMode(false);

    try {
      playerRef.current.seekTo(60, true);
      playerRef.current.playVideo();
      setLoopRunning(true);
    } catch (error) {
      console.error("Error controlling YouTube player:", error);
    }
  };

  const handleStartManual = () => {
    resetAll();
    setLoopRunning(false);
    setIsManualMode(true);

    if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
      try {
        playerRef.current.pauseVideo();
      } catch (error) {
        console.error("Error pausing video:", error);
      }
    }
  };

  const activeIndex = isManualMode ? manualIndex : currentIndex;

  return (
    <div className="min-h-screen bg-[#111217] text-slate-100 flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-6xl rounded-3xl bg-gradient-to-b from-[#181921] to-[#101117] shadow-2xl border border-white/5 p-6 md:p-10 space-y-8">

        {/* Title */}
        <header className="text-center space-y-4">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-wide text-rose-300">
            Preamble Analyzer
          </h1>

          <div className="flex items-center justify-center gap-4">
            <img
              src="/abraham-lincoln.png"
              alt="Lincoln"
              className="h-12 w-12 md:h-16 md:w-16 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
            />
            <img
              src="/capitol.png"
              alt="Capitol"
              className="h-12 w-12 md:h-16 md:w-16 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleStartWithVideo}
              disabled={!ready || loopRunning}
              className="rounded-full bg-blue-600 px-6 py-2.5 text-sm md:text-base font-semibold shadow-lg shadow-blue-500/40 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {!ready ? "Loading YouTube Player..." : loopRunning ? "Playing…" : "Play Song & Sync"}
            </button>

            <button
              onClick={handleStartManual}
              disabled={loopRunning || isManualMode}
              className="rounded-full border border-slate-600 bg-slate-800 px-6 py-2.5 text-sm md:text-base font-semibold hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {isManualMode ? "Animating…" : "Run Animation Only"}
            </button>
          </div>
        </header>

        {/* Preamble Text - Full Width */}
        <div style={{ 
          background: 'rgba(248, 250, 252, 0.95)', 
          color: '#1e293b',
          padding: '2.5rem',
          borderRadius: '1.5rem',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          marginBottom: '2rem'
        }}>
          <p style={{ 
            lineHeight: '2',
            fontSize: '1.1rem',
            textAlign: 'center'
          }}>
            {words.map((word, i) => {
              const hasBeenPassed = i < activeIndex;
              const clean = word.toLowerCase().replace(/[.,]/g, "");

              const startsT = clean.startsWith("t");
              const endsE = clean.endsWith("e");
              const both = startsT && endsE;

              let colorStyle = {};
              let bgStyle = {};
              
              if (i === activeIndex) {
                bgStyle = { backgroundColor: '#fef08a', boxShadow: '0 0 0 1px rgba(0,0,0,0.15)' };
              }
              
              if (hasBeenPassed) {
                if (both) colorStyle = { color: '#2563eb', fontWeight: '600' };
                else if (startsT) colorStyle = { color: '#16a34a', fontWeight: '600' };
                else if (endsE) colorStyle = { color: '#dc2626', fontWeight: '600' };
              }

              return (
                <span
                  key={i}
                  style={{
                    padding: '0 2px',
                    borderRadius: '4px',
                    transition: 'all 0.15s',
                    ...bgStyle,
                    ...colorStyle
                  }}
                >
                  {word + " "}
                </span>
              );
            })}
          </p>
        </div>

        {/* Stats Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          <StatCard label='Starts with "t"' value={startsWithTCount} accent="green" />
          <StatCard label='Ends with "e"' value={endsWithECount} accent="red" />
          <StatCard label='Starts with "t" & ends with "e"' value={doesBothCount} accent="blue" />
        </div>

        {/* Video */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          gap: '0.75rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '600px',
            aspectRatio: '16/9',
            borderRadius: '1.25rem',
            overflow: 'hidden',
            border: '3px solid #334155',
            backgroundColor: '#000',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </div>
          <p style={{
            fontSize: '0.75rem',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            Video credit: Schoolhouse Rock / Disney Educational Productions. Embedded under YouTube&apos;s permitted embed usage.
          </p>
        </div>
      </main>
    </div>
  );
}

// StatCard component (kept close to what you had)
function StatCard({ label, value, accent }) {
  const colorClasses = {
    green: { from: "#16a34a", to: "#22c55e" },
    red: { from: "#bf0a30", to: "#e63946" },
    blue: { from: "#002868", to: "#1a4480" },
  };

  const colors = colorClasses[accent] || colorClasses.green;

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-2xl"
      style={{
        background: `linear-gradient(135deg, ${colors.from} 0%, ${colors.to} 100%)`,
        boxShadow: `0 20px 40px rgba(0,0,0,0.3), 0 0 30px ${colors.from}40`,
      }}
    >
      <div className="px-5 py-4 relative z-10 w-full">
        <p
          className="text-xs md:text-sm font-bold uppercase tracking-wider text-white mb-2 opacity-95"
          style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
        >
          {label}
        </p>

        <div className="flex items-baseline justify-between w-full">
          <span
            key={value}
            className="text-4xl md:text-5xl font-black text-white leading-none"
            style={{
              textShadow: "0 4px 8px rgba(0,0,0,0.5), 0 0 20px rgba(255,255,255,0.25)",
            }}
          >
            {value}
          </span>

          <span
            className="text-[11px] md:text-xs text-white opacity-90 ml-3 font-bold uppercase tracking-wide"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
          >
            words
          </span>
        </div>
      </div>

      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-20 blur-2xl"
        style={{ background: colors.to, transform: "translate(30%, -30%)" }}
      />
      <div
        className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-20 blur-xl"
        style={{ background: colors.from, transform: "translate(-30%, 30%)" }}
      />
    </div>
  );
}