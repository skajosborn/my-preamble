import React, { useState, useEffect, useMemo, useRef } from "react";

/**
 * PreambleAnalyzer
 * ------------------------------------------------------------
 * What this component does:
 * 1) Displays the U.S. Constitution preamble word by word.
 * 2) Highlights the "active" word in yellow as time progresses.
 * 3) Counts how many words (by index):
 *   - Start with "t"
 *   - End with "e"
 *   - Start with "t" AND end with "e"
 * 4) Supports two modes:
 *   - Animation mode: Loops through the words on a timer and increments the coordinating counter each time it finds a word that starts with "t" or ends with "e" or starts with "t" and ends with "e".
 *   - Song and sync mode: Syncs animation mode to a Schoolhouse Rock song on the Preamble.
 * 
 * Key design choices:
 * - `useRef` is used for instant truth values 
 * - `useEffect` is used for side effects like setting up the YouTube player and syncing the animation to the song.
 * - `useState` is used for state management.
 * - `countedWordsRef` is used to avoid double-counting words.
 * - Computed indices are clamped to avoid out-of-range errors.
**/


/** The Preamble to the Constitution as a string of words */
const PREAMBLE =
  'We the People, of the United States, in Order to form a more perfect Union, establish Justice, insure domestic Tranquility, provide for the common defence, promote the general Welfare, and secure the Blessings of Liberty to ourselves and our Posterity, do ordain and establish this Constitution for the United States of America.';

/**
 * YouTube video timing configuration.
 * Adjust these constants if video timing synchronization is off.
 */
const VIDEO_ID = "8_NzZvdsbWI";
const START_OFFSET_SECONDS = 130.0; // Start time of the Preamble in the video (2:10 in seconds)
const PREAMBLE_END_SECONDS = 170.0; // End time of the Preamble in the video (2:49 in seconds)

/** Regular expression to remove punctuation from words */
const PUNCTUATION_REGEX = /[.,]/g;

/** Easing factor for smooth word highlighting transitions (exponential easing) */
const EASING_FACTOR = 1.15; 

/**
 * Utility: Clamps a number between min and max values.
 * 
 * @param {number} n - The number to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} The clamped value
 */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Utility: Normalizes a word by removing punctuation and converting to lowercase.
 * 
 * @param {string} word - The word to normalize
 * @returns {string} The normalized word (lowercase, no punctuation)
 */
function normalizeWord(word) {
  return word.toLowerCase().replace(PUNCTUATION_REGEX, "");
}

/**
 * Utility: Computes word characteristics for counting purposes.
 * Determines if a word starts with "t", ends with "e", or both.
 * 
 * @param {string} word - The word to analyze (will be normalized internally)
 * @returns {Object} Object with startsT, endsE, and both boolean properties
 */
function computeCounts(word) {
  const cleanWord = normalizeWord(word);
  const startsT = cleanWord.startsWith("t");
  const endsE = cleanWord.endsWith("e");
  const both = startsT && endsE;
  return { startsT, endsE, both };
}

/** Main component */
/**
 * Main PreambleAnalyzer component.
 * Manages word highlighting, counting, and video synchronization.
 */
export default function PreambleAnalyzer() {
  /** The Preamble as an array of words (memoized to avoid recalculation) */
  const words = useMemo(() => PREAMBLE.split(" "), []);
  // Refs for YouTube player management
  const playerRef = useRef(null); // Stores the YouTube player instance
  const containerRef = useRef(null); // Container element for the YouTube player

  // Refs for animation state tracking (using refs for instant truth values)
  /** Tracks which words have been counted to avoid double-counting */
  const countedWordsRef = useRef(new Set());
  /** Tracks the last word index that was processed */
  const lastIndexRef = useRef(-1);

  // ------------------------------------------------------------
  // React State Declarations
  // ------------------------------------------------------------
  // YouTube player state
  const [ready, setReady] = useState(false); // Whether the YouTube player is ready
  const [duration, setDuration] = useState(null); // Duration of the video in seconds

  // Word highlighting and counting state
  const [currentIndex, setCurrentIndex] = useState(-1); // Current active word index in video sync mode
  const [startsWithTCount, setStartsWithTCount] = useState(0); // Count of words starting with "t"
  const [endsWithECount, setEndsWithECount] = useState(0); // Count of words ending with "e"
  const [doesBothCount, setDoesBothCount] = useState(0); // Count of words starting with "t" AND ending with "e"

  // Animation control state
  const [loopRunning, setLoopRunning] = useState(false); // Whether the video sync animation loop is running
  const [isManualMode, setIsManualMode] = useState(false); // Whether manual animation mode is active
  const [manualIndex, setManualIndex] = useState(-1); // Current active word index in manual mode 

// ------------------------------------------------------------
// YouTube Player Setup
// ------------------------------------------------------------
  /**
   * Sets up the YouTube iframe player when the component mounts.
   * Handles both cases: when the API is already loaded and when it needs to load.
   */
  useEffect(() => {
    if (!containerRef.current) return;

    /**
     * Callback function for when the YouTube iframe API is ready.
     * Creates the YouTube player instance and sets up event handlers.
     */
    function onYouTubeIframeAPIReady() {
      try {
        if (!window.YT || !window.YT.Player) {
          console.error("YouTube API not available");
          return;
        }

        // Create and store player instance
        const player = new window.YT.Player(containerRef.current, {
          videoId: VIDEO_ID,
          events: {
            /**
             * Called when the player is ready to accept commands.
             * Verifies required methods exist and initializes player state.
             */
            onReady: (event) => {
              const readyPlayer = event.target;

              // Verify required methods exist
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

            /**
             * Handles player state changes (playing, paused, ended, etc.).
             */
            onStateChange: (event) => {
              // Stop if video ended
              if (event.data === window.YT.PlayerState.ENDED) {
                setLoopRunning(false);
                setCurrentIndex(words.length - 1);
                return;
              }

              // Stop loop if video is paused
              if (event.data === window.YT.PlayerState.PAUSED) {
                setLoopRunning(false);
              }
            },

            /**
             * Error handler for YouTube player errors.
             */
            onError: (event) => {
              console.error("YouTube player error:", event.data);
            },
          },
        });

        // Store player instance (also stored in onReady, but keeping here for safety)
        playerRef.current = player;
      } catch (error) {
        console.error("Error creating YouTube player:", error);
      }
    }

    // If API is already loaded, create the player immediately.
    // Otherwise, wait for the global callback.
    if (window.YT && window.YT.Player) {
      onYouTubeIframeAPIReady();
    } else {
      window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
    }
  }, []); // Empty deps: only run on mount

  // ------------------------------------------------------------
  // Video Sync Loop
  // ------------------------------------------------------------
  /**
   * Synchronizes word highlighting with the YouTube video playback.
   * Uses requestAnimationFrame to smoothly update the active word index
   * based on the current video playback time.
   */
  useEffect(() => {
    // Early return if conditions aren't met for video sync
    if (!loopRunning || !playerRef.current || !duration || isManualMode || !ready) {
      return;
    }

    let animationFrameId;

    /**
     * Animation frame callback that updates the active word index
     * based on the current video playback time.
     */
    const update = () => {
      if (!playerRef.current || typeof playerRef.current.getCurrentTime !== "function") { 
        return;
      }

      try {
        const currentTime = playerRef.current.getCurrentTime();

        // Wait until the preamble section starts
        if (currentTime < START_OFFSET_SECONDS) {
          animationFrameId = requestAnimationFrame(update);
          return;
        }

        // Stop when the preamble ends
        if (currentTime > PREAMBLE_END_SECONDS) {
          setCurrentIndex(words.length - 1);
          setLoopRunning(false);
          // Pause the video when preamble completes
          try {
            if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
              playerRef.current.pauseVideo();
            }
          } catch (error) {
            console.error("Error pausing video at end:", error);
          }
          return;
        }

        // Calculate progress through the preamble (0.0 to 1.0)
        const preambleDuration = PREAMBLE_END_SECONDS - START_OFFSET_SECONDS;
        const effectiveTime = currentTime - START_OFFSET_SECONDS;
        const progress = Math.min(effectiveTime / preambleDuration, 1.0);

        // Apply easing for smoother visual transitions
        const easedProgress = progress < 1 ? Math.pow(progress, EASING_FACTOR) : progress;

        // Map eased progress to word index
        const index = Math.floor(easedProgress * words.length);

        // Advance index when it changes
        if (index !== lastIndexRef.current && index >= 0 && index < words.length) {
          const cleanWord = normalizeWord(words[index]);

          lastIndexRef.current = index;
          setCurrentIndex(index);

          // Count each word once using a unique key (index + word)
          const wordKey = `${index}-${cleanWord}`;
          if (!countedWordsRef.current.has(wordKey)) {
            countedWordsRef.current.add(wordKey);

            // Update counters based on word characteristics
            const counts = computeCounts(cleanWord);
            if (counts.startsT) {
              setStartsWithTCount((p) => p + 1);
            }
            if (counts.endsE) {
              setEndsWithECount((p) => p + 1);
            }
            if (counts.both) {
              setDoesBothCount((p) => p + 1);
            }
          }
        }

        animationFrameId = requestAnimationFrame(update);
      } catch (error) {
        console.error("Error in video sync loop:", error);
        setLoopRunning(false);
      }
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(update);

    // Cleanup: cancel animation frame on unmount or dependency change
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [loopRunning, duration, isManualMode, ready, words.length]);

  // ------------------------------------------------------------
  // Manual Mode Loop
  // ------------------------------------------------------------
  /**
   * Handles word-by-word animation when in manual mode (no video sync).
   * Advances through words at a fixed interval and updates counters.
   */
  useEffect(() => {
    // Don't run if manual mode is off or video loop is running
    if (!isManualMode || loopRunning) return;

    // Stop when we reach the last word
    if (manualIndex >= words.length - 1) {
      setIsManualMode(false);
      return;
    }

    // Advance to next word after a delay
    const timer = setTimeout(() => {
      setManualIndex((prev) => {
        const nextIndex = prev + 1;

        if (nextIndex < words.length) {
          const cleanWord = normalizeWord(words[nextIndex]);

          // Update counters based on word characteristics
          const counts = computeCounts(cleanWord);
          if (counts.startsT) {
            setStartsWithTCount((p) => p + 1);
          }
          if (counts.endsE) {
            setEndsWithECount((p) => p + 1);
          }
          if (counts.both) {
            setDoesBothCount((p) => p + 1);
          }
        }

        return nextIndex;
      });
    }, 400); // 400ms delay between words

    // Cleanup: clear timeout on unmount or dependency change
    return () => clearTimeout(timer);
  }, [isManualMode, manualIndex, loopRunning, words.length]);

  // ------------------------------------------------------------
  // Button Handlers
  // ------------------------------------------------------------
  /**
   * Resets all counters, indices, and refs to their initial state.
   * Called when starting a new animation session.
   */
  const resetAll = () => {
    // Reset counters
    setStartsWithTCount(0);
    setEndsWithECount(0);
    setDoesBothCount(0);

    // Reset indices
    setCurrentIndex(-1);
    setManualIndex(-1);

    // Reset refs
    countedWordsRef.current.clear();
    lastIndexRef.current = -1;
  };

  /**
   * Starts the animation synchronized with the YouTube video.
   * Seeks to the preamble start time and begins playback.
   */
  const handleStartWithVideo = () => {
    if (!playerRef.current || !ready) return;
    if (
      typeof playerRef.current.seekTo !== "function" ||
      typeof playerRef.current.playVideo !== "function"
    ) {
      console.warn("YouTube player methods not available");
      return;
    }

    resetAll();
    setIsManualMode(false);

    try {
      playerRef.current.seekTo(START_OFFSET_SECONDS, true);
      playerRef.current.playVideo();
      setLoopRunning(true);
    } catch (error) {
      console.error("Error controlling YouTube player:", error);
    }
  };

  /**
   * Starts the manual animation mode (no video sync).
   * Pauses the video if it's playing and begins word-by-word animation.
   */
  const handleStartManual = () => {
    resetAll();
    setLoopRunning(false);
    setIsManualMode(true);

    // Pause video if playing
    if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
      try {
        playerRef.current.pauseVideo();
      } catch (error) {
        console.error("Error pausing video:", error);
      }
    }
  };

  // Determine which index to use for highlighting based on current mode
  const activeIndex = isManualMode ? manualIndex : currentIndex;

  return (
    <div className="min-h-screen bg-[#111217] text-slate-100 flex flex-col items-center justify-center px-4 py-10">
      <main className="w-full max-w-4xl rounded-3xl bg-gradient-to-b from-[#181921] to-[#101117] shadow-2xl border border-white/5 p-6 md:p-10 space-y-8">

        {/* Title */}
        <header className="text-center space-y-4">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-wide mb-6" style={{ color: '#2563eb' }}>
            Preamble Analyzer
          </h1>

          <div className="flex items-center justify-center gap-8">
            {/* First icon-button pair */}
            <div className="flex flex-col items-center gap-2">
              <img
                src="/abraham-lincoln.png"
                alt="Lincoln"
                className="h-16 w-16 md:h-20 md:w-20 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
              />
              <button
                onClick={handleStartWithVideo}
                disabled={!ready || loopRunning}
                className="rounded-full bg-blue-600 px-5 py-2 text-xs md:text-sm font-semibold shadow-lg shadow-blue-500/40 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition"
              >
                {!ready ? "Loading YouTube Player..." : loopRunning ? "Playing…" : "Play Song & Sync"}
              </button>
            </div>

            {/* Second icon-button pair */}
            <div className="flex flex-col items-center gap-2">
              <img
                src="/capitol.png"
                alt="Capitol"
                className="h-16 w-16 md:h-20 md:w-20 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
              />
              <button
                onClick={handleStartManual}
                disabled={loopRunning || isManualMode}
                className="rounded-full border border-slate-600 bg-slate-800 px-5 py-2 text-xs md:text-sm font-semibold hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition"
              >
                {isManualMode ? "Animating…" : "Run Animation Only"}
              </button>
            </div>
          </div>
        </header>

        {/* Preamble Text - Full Width */}
        <div style={{ 
          background: 'rgba(248, 250, 252, 0.95)', 
          color: '#1e293b',
          padding: '2rem 1.5rem',
          minHeight: '250px',
          borderRadius: '1.5rem',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <p style={{ 
            lineHeight: '1.8',
            fontSize: '1.25rem',
            textAlign: 'center',
            width: '100%'
          }}>
            {words.map((word, i) => {
              const hasBeenPassed = i < activeIndex;
              const clean = normalizeWord(word);
              const counts = computeCounts(clean);
              const startsT = counts.startsT;
              const endsE = counts.endsE;
              const both = counts.both;

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
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <StatCard label='Starts with "t"' value={startsWithTCount} accent="green" />
          <StatCard label='Ends with "e"' value={endsWithECount} accent="red" />
          <StatCard label='Starts with "t" & ends with "e"' value={doesBothCount} accent="blue" />
        </div>

        {/* Video - Below everything, requires scroll */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          gap: '0.75rem',
          marginBottom: '2rem',
          marginTop: '4rem'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '600px',
            height: '0',
            paddingBottom: '56.25%',
            position: 'relative',
            borderRadius: '1.25rem',
            overflow: 'hidden',
            border: '3px solid #334155',
            backgroundColor: '#000',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div 
              ref={containerRef} 
              style={{ 
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%'
              }} 
            />
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

      {/* My Code Section - Separate Container */}
      {/* This section has the original code to solve the coding task. */}
      <div style={{
        width: '100%',
        maxWidth: '48rem',
        marginTop: '2rem',
        padding: '1.5rem',
        borderRadius: '1.5rem',
        background: 'rgba(24, 25, 33, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <div style={{
            textAlign: 'center',
            marginBottom: '0.25rem'
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: '#2563eb',
              marginBottom: '0.25rem'
            }}>
              My Code
            </h2>
            <p style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              padding: '0 1rem'
            }}>
              Below you will find the original code to solve the coding task.
            </p>
          </div>
          <img
            src="/code1.png"
            alt="Code 1"
            style={{
              maxWidth: '100%',
              width: '100%',
              height: 'auto',
              borderRadius: '0.5rem'
            }}
          />
          <img
            src="/code2.png"
            alt="Code 2"
            style={{
              maxWidth: '100%',
              width: '100%',
              height: 'auto',
              borderRadius: '0.5rem'
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// StatCard Component
// ------------------------------------------------------------
/**
 * Displays a statistic card with a label, value, and accent color.
 * 
 * @param {string} label - The label text to display
 * @param {number} value - The numeric value to display
 * @param {string} accent - Color accent: "green", "red", or "blue"
 */
function StatCard({ label, value, accent }) {
  const colorClasses = {
    green: { from: "#16a34a", to: "#22c55e" },
    red: { from: "#bf0a30", to: "#e63946" },
    blue: { from: "#2563eb", to: "#3b82f6" },
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
      <div className="px-4 py-3 relative z-10 w-full">
        <p
          className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-white mb-1.5 opacity-95"
          style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
        >
          {label}
        </p>

        <div className="flex items-baseline justify-between w-full">
          <span
            key={value}
            className="text-2xl md:text-3xl font-black text-white leading-none"
            style={{
              textShadow: "0 4px 8px rgba(0,0,0,0.5), 0 0 20px rgba(255,255,255,0.25)",
            }}
          >
            {value}
          </span>

          <span
            className="text-[9px] md:text-[10px] text-white opacity-90 ml-2 font-bold uppercase tracking-wide"
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