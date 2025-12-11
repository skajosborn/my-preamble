import React, { useState, useEffect, useRef } from 'react';


const Preamble =  "We the People, in Order to form a more perfect Union, establish Justice, insure domestic Tranquility, provide for the common defence, promote the general Welfare, and secure the Blessings of Liberty to ourselves and our Posterity, do ordain and establish this Constitution for the United States of America.";

const words = Preamble.split(' ');

export default function PreambleAnalyzer() {
    const playerRef = useRef(null);
    const containerRef = useRef(null);

    const [ready, setReady] = useState(false);
    const [duration, setDuration] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [startsWithT, setStartsWithT] = useState(0);
    const [endsWithE, setEndsWithE] = useState(0);
    const [doesBoth, setDoesBoth] = useState(0);
    const [loopRunning, setLoopRunning] = useState(false);
    const [isManualMode, setIsManualMode] = useState(false);
    const [manualIndex, setManualIndex] = useState(-1);
    const [isPausedAtTranquility, setIsPausedAtTranquility] = useState(false);

    // Track which words have been counted to avoid double-counting
    const countedWordsRef = useRef(new Set());
    const pauseStartTimeRef = useRef(null);
    const hasPausedAtTranquilityRef = useRef(false);

    // Create the YouTube player when API is loaded
    useEffect(() => {
        if (!containerRef.current) return;

        function onYouTubeIframeAPIReady() {
            try {
                // eslint-disable-next-line no-undef
                if (!window.YT || !window.YT.Player) {
                    console.error('YouTube API not available');
                    return;
                }

                // eslint-disable-next-line no-undef
                const player = new YT.Player(containerRef.current, {
                    videoId: "8_NzZvdsbWI",
                    events: {
                        onReady: (event) => {
                            // Verify player methods are available
                            const readyPlayer = event.target;
                            if (readyPlayer && 
                                typeof readyPlayer.seekTo === 'function' && 
                                typeof readyPlayer.playVideo === 'function' &&
                                typeof readyPlayer.getCurrentTime === 'function') {
                                playerRef.current = readyPlayer; // Ensure ref is set
                                setReady(true);
                                const d = readyPlayer.getDuration();
                                setDuration(d);
                            } else {
                                console.error('YouTube player methods not available on ready');
                            }
                        },
                        onStateChange: (event) => {
                            // If video ended, stop the loop
                            if (event.data === YT.PlayerState.ENDED) {
                              setLoopRunning(false);
                              setCurrentIndex(words.length - 1);
                            }
                          
                            // Only stop the loop for "normal" pauses (user/manual),
                         // but NOT for the special Tranquility pause
                         if (
                         event.data === YT.PlayerState.PAUSED &&
                         !hasPausedAtTranquilityRef.current
                         ) {
                         setLoopRunning(false);
                         }
                        },
                        onError: (event) => {
                            console.error('YouTube player error:', event.data);
                        },
                    },
                });
                // Set ref immediately even before ready
                playerRef.current = player;
            } catch (error) {
                console.error('Error creating YouTube player:', error);
            }
        }

        // If API already loaded, call immediately
        if (window.YT && window.YT.Player) {
            onYouTubeIframeAPIReady();
        } else {
            // Attach to global callback YouTube expects
            window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
        }
    }, []);

    // Loop that reads currentTime and updates which word is active (for video sync)
    const lastIndexRef = useRef(-1);

    useEffect(() => {
        if (!loopRunning || !playerRef.current || !duration || isManualMode || !ready) return;

        let animationFrameId;

        const update = () => {
            if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') {
                return;
            }
            
            try {
                const currentTime = playerRef.current.getCurrentTime();
                const startOffset = 60.0; // Video starts at 1 minute (60 seconds)
                const preambleEndTime = 90.0; // Adjust this to when the preamble ends in the video (e.g., 90 seconds = 1:30)
                
                // Only calculate progress after the start offset
                if (currentTime < startOffset) {
                    animationFrameId = requestAnimationFrame(update);
                    return;
                }
                
                // Stop if we've passed the preamble end time
                if (currentTime > preambleEndTime) {
                    setCurrentIndex(words.length - 1);
                    animationFrameId = requestAnimationFrame(update);
                    return;
                }
                
                // Calculate progress using the preamble segment (startOffset to preambleEndTime)
                const preambleDuration = preambleEndTime - startOffset;
                const effectiveTime = currentTime - startOffset;
                let progress = Math.min(effectiveTime / preambleDuration, 1.0); // 0 to 1, clamped
                
                // Apply gentle easing to start slightly slower
                // Adjust the easing factor: 1.0 = no easing (linear), 1.1 = very gentle, 1.2 = gentle, 1.5 = more noticeable, 2.0 = quadratic
                // Lower values = less slowdown at start, higher values = more slowdown
                const easingFactor = 1.15; // Adjust this: lower = faster start, higher = slower start
                const easedProgress = progress < 1 
                    ? Math.pow(progress, easingFactor) 
                    : progress;
                
                const index = Math.floor(easedProgress * words.length);
            
            // If we're paused at tranquility, keep highlighting it and don't advance
            if (isPausedAtTranquility) {
                // Find tranquility index
                const tranquilityIndex = words.findIndex(w => w.toLowerCase().replace(/[.,]/g, '') === 'tranquility');
                if (tranquilityIndex >= 0) {
                    setCurrentIndex(tranquilityIndex);
                }
                animationFrameId = requestAnimationFrame(update);
                return;
            }
            
            if (index !== lastIndexRef.current && index >= 0 && index < words.length) {
                // Check if we've reached "Tranquility" and need to pause
                let word = words[index].toLowerCase();
                let cleanWord = word.replace(/[.,]/g, '');
                
                // If we reach "tranquility" and haven't paused yet, pause the video
                if (cleanWord === 'tranquility' && !hasPausedAtTranquilityRef.current) {
                    hasPausedAtTranquilityRef.current = true;
                    setIsPausedAtTranquility(true);
                    pauseStartTimeRef.current = currentTime;
                    
                    // Set the index to tranquility first
                    lastIndexRef.current = index;
                    setCurrentIndex(index);
                    
                    // Pause the video
                    try {
                        if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
                            playerRef.current.pauseVideo();
                        }
                    } catch (error) {
                        console.error('Error pausing video:', error);
                    }
                    
                    // Resume after 0.3 seconds (very brief pause - just a slight emphasis)
                    setTimeout(() => {
                        try {
                            if (playerRef.current) {
                                // Get the time when we paused and seek forward to move past tranquility
                                const pausedTime = pauseStartTimeRef.current || playerRef.current.getCurrentTime();
                                // Seek forward enough to advance to next word (0.3 seconds should move past tranquility)
                                playerRef.current.seekTo(pausedTime + 0.3, true);
                                
                                // Find tranquility index and set lastIndex to it
                                // This ensures the update loop will detect the change when it recalculates
                                const tranquilityIndex = words.findIndex(w => w.toLowerCase().replace(/[.,]/g, '') === 'tranquility');
                                if (tranquilityIndex >= 0) {
                                    lastIndexRef.current = tranquilityIndex;
                                }
                                
                                // Clear pause state FIRST before resuming
                                setIsPausedAtTranquility(false);
                                pauseStartTimeRef.current = null;
                                
                                // Small delay to ensure state updates, then resume video
                                setTimeout(() => {
                                    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
                                        playerRef.current.playVideo();
                                    }
                                }, 50);
                            }
                        } catch (error) {
                            console.error('Error resuming video:', error);
                            setIsPausedAtTranquility(false);
                            pauseStartTimeRef.current = null;
                        }
                    }, 300); // 0.3 second pause (just a brief emphasis)
                    
                    animationFrameId = requestAnimationFrame(update);
                    return;
                }
                
                lastIndexRef.current = index;
                setCurrentIndex(index);

                // Count logic - only count each word once
                if (word.endsWith(",") || word.endsWith(".")) {
                    word = word.slice(0, -1);
                }
                
                // Use a unique key for each word index to track counting
                const wordKey = `${index}-${word}`;
                if (!countedWordsRef.current.has(wordKey)) {
                    countedWordsRef.current.add(wordKey);
                    
                    if (word.startsWith("t")) {
                        setStartsWithT((prev) => prev + 1);
                    }
                    if (word.endsWith("e")) {
                        setEndsWithE((prev) => prev + 1);
                    }
                    if (word.startsWith("t") && word.endsWith("e")) {
                        setDoesBoth((prev) => prev + 1);
                    }
                }
            }

                animationFrameId = requestAnimationFrame(update);
            } catch (error) {
                console.error('Error getting video current time:', error);
                setLoopRunning(false);
            }
        };

        animationFrameId = requestAnimationFrame(update);

        return () => cancelAnimationFrame(animationFrameId);
    }, [loopRunning, duration, isManualMode, ready]);

    // Manual animation mode (original timer-based)
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
                    let word = words[nextIndex].toLowerCase().replace(/[.,]/g, '');

            if (word.startsWith('t')) {
                setStartsWithT((prev) => prev + 1);
            }
            if (word.endsWith('e')) {
                setEndsWithE((prev) => prev + 1);
            }
            if (word.startsWith('t') && word.endsWith('e')) {
                setDoesBoth((prev) => prev + 1);
            }
                }
                return nextIndex;
            });
        }, 400);

        return () => clearTimeout(timer);
    }, [isManualMode, manualIndex, loopRunning]);

    const handleStartWithVideo = () => {
        if (!playerRef.current || !ready) {
            console.warn('YouTube player not ready yet');
            return;
        }

        // Check if player methods exist
        if (typeof playerRef.current.seekTo !== 'function' || 
            typeof playerRef.current.playVideo !== 'function') {
            console.warn('YouTube player methods not available');
            return;
        }

        // Reset everything
        setStartsWithT(0);
        setEndsWithE(0);
        setDoesBoth(0);
        setCurrentIndex(-1);
        countedWordsRef.current.clear();
        setIsManualMode(false);
        setManualIndex(-1);
        setIsPausedAtTranquility(false);
        pauseStartTimeRef.current = null;
        hasPausedAtTranquilityRef.current = false;
        lastIndexRef.current = -1;

        try {
            playerRef.current.seekTo(60, true); // Start at 1 minute (60 seconds) where preamble begins
            playerRef.current.playVideo();
            setLoopRunning(true);
        } catch (error) {
            console.error('Error controlling YouTube player:', error);
        }
    };

    const handleStartManual = () => {
        // Reset everything
            setStartsWithT(0);
            setEndsWithE(0);
            setDoesBoth(0);
        setCurrentIndex(-1);
        countedWordsRef.current.clear();
        setLoopRunning(false);
        setManualIndex(-1);
        setIsManualMode(true);
        setIsPausedAtTranquility(false);
        pauseStartTimeRef.current = null;
        hasPausedAtTranquilityRef.current = false;
        
        // Stop video if playing
        if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
            try {
                playerRef.current.pauseVideo();
            } catch (error) {
                console.error('Error pausing video:', error);
            }
        }
    };

    // Use currentIndex for video sync, manualIndex for manual mode
    const activeIndex = isManualMode ? manualIndex : currentIndex;

        return (
            <div className="patriotic-card">
              <div className="patriotic-header">
                <h1 className="patriotic-title">
                  🇺🇸 Preamble Word Analyzer 🇺🇸
              </h1>
                <p className="patriotic-subtitle">Analyzing Our Nation's Founding Words</p>
              </div>
        
              {/* <p className="patriotic-description">
                This tool goes through the Preamble one word at a time and counts how
                many words <span className="font-semibold">start with &quot;t&quot;</span>,{" "}
                <span className="font-semibold">end with &quot;e&quot;</span>, and{" "}
                <span className="font-semibold">do both</span>.
              </p> */}
        
              {/* Preamble text with animated highlight */}
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 px-5 py-4 leading-10 text-slate-800 text-xl">
                {words.map((word, i) => {
                  // Check if word has been passed (index < activeIndex)
                  const hasBeenPassed = i < activeIndex;
                  
                  // Clean word for checking (remove punctuation)
                  const cleanWord = word.toLowerCase().replace(/[.,]/g, '');
                  
                  // Check word characteristics
                  const startsWithT = cleanWord.startsWith('t');
                  const endsWithE = cleanWord.endsWith('e');
                  const doesBoth = startsWithT && endsWithE;
                  
                  // Determine color class
                  let colorClass = '';
                  if (hasBeenPassed) {
                    if (doesBoth) {
                      colorClass = 'text-blue-600 font-semibold';
                    } else if (startsWithT) {
                      colorClass = 'text-green-600 font-semibold';
                    } else if (endsWithE) {
                      colorClass = 'text-red-600 font-semibold';
                    }
                  }
                  
                  return (
                    <span
                      key={i}
                      className={
                        "px-0.5 rounded-sm transition-colors duration-150 " +
                        (i === activeIndex ? "bg-yellow-200 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" : "") +
                        (colorClass ? " " + colorClass : "")
                      }
                    >
                      {word + " "}
                    </span>
                  );
                })}
              </div>
        
              {/* YouTube Video */}
              <div className="video-container">
                <div
                  ref={containerRef}
                  className="youtube-iframe"
                />
                <p className="video-credit">
                  Video credit: Schoolhouse Rock / Disney Educational Productions. 
                  Embedded under YouTube&apos;s permitted embed usage.
                </p>
              </div>
        
              <div className="button-container">
                <button
                  onClick={handleStartWithVideo}
                  disabled={!ready || (loopRunning && !isManualMode)}
                  className="patriotic-button patriotic-button-secondary"
                >
                  {!ready ? "Loading YouTube Player..." : (loopRunning ? "Syncing with Video..." : "Play Song & Sync")}
              </button>
              </div>
              {loopRunning && !isManualMode && (
                <p className="sync-instruction">
                  💡 The animation is synced with the video! Words highlight in real-time as the song plays.
                </p>
              )}
        
              {/* Stats row */}
              <div className="mt-6 grid gap-4 md:grid-cols-3" style={{ padding: '0 30px 30px 30px' }}>
                <StatCard
                  label='Starts with "t"'
                  value={startsWithT}
                  accent="from-sky-500 to-sky-600"
                />
                <StatCard
                  label='Ends with "e"'
                  value={endsWithE}
                  accent="from-emerald-500 to-emerald-600"
                />
                <StatCard
                  label='Starts with "t" & ends with "e"'
                  value={doesBoth}
                  accent="from-amber-500 to-amber-600"
                />
              </div>
            </div>
          );
        }
        
        // StatCard component
        function StatCard({ label, value, accent }) {
          return (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
              {/* colored top border / accent */}
              <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
              <div className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <div className="mt-1 flex items-end justify-between">
              <span
                    key={value} // forces re-mount so animation restarts
                    className="text-3xl font-extrabold text-slate-900 animate-[pulse_0.25s_ease-out]"
              >
                {value}
              </span>
                  <span className="text-xs text-slate-400">
                    words
                  </span>
                </div>
              </div>
            </div>
          );
        }