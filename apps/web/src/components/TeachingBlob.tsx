import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export type BlobState = 'idle' | 'user-speaking' | 'thinking' | 'blob-speaking';

interface TeachingBlobProps {
  size?: number;
  interactive?: boolean;
  state?: BlobState;
  onStateChange?: (state: BlobState) => void;
  speechText?: string;
  onSpeechEnd?: () => void;
}

export const TeachingBlob: React.FC<TeachingBlobProps> = ({ 
  size = 320, 
  interactive = true,
  state: controlledState,
  onStateChange,
  speechText = "Hello I am Akara. What are you going to teach me today ?",
  onSpeechEnd,
}) => {
  const [internalState, setInternalState] = useState<BlobState>('idle');
  const currentState = controlledState ?? internalState;

  const [isSquishing, setIsSquishing] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [visibleWordCount, setVisibleWordCount] = useState<number>(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userSpeakingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const thinkingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const words = speechText.split(' ').filter(Boolean);
  const MAX_VISIBLE_WORDS = 4; // Single compact line window
  const startWordIdx = Math.max(0, visibleWordCount - MAX_VISIBLE_WORDS);
  const currentChunk = words.slice(startWordIdx, visibleWordCount);

  // Load available speech synthesis voices for the nicest companion voice
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) setVoices(v);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const pickBestVoice = (): SpeechSynthesisVoice | null => {
    const list = voices.length > 0 ? voices : (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : []);
    if (!list || list.length === 0) return null;

    // High quality, warm, friendly and curious companion voices
    const preferredNames = [
      'Microsoft Maisie Online (Natural)',
      'Microsoft Ana Online (Natural)',
      'Microsoft Jenny Online (Natural)',
      'Microsoft Aria Online (Natural)',
      'Google UK English Female',
      'Samantha',
      'Victoria',
      'Google US English',
      'Karen',
      'Moira',
      'Tessa',
      'Serena',
      'Fiona',
    ];

    for (const name of preferredNames) {
      const match = list.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (match) return match;
    }

    const naturalEn = list.find(v => 
      v.lang.startsWith('en') && (
        v.name.toLowerCase().includes('natural') || 
        v.name.toLowerCase().includes('female') ||
        v.name.toLowerCase().includes('premium') ||
        v.name.toLowerCase().includes('online')
      )
    );
    if (naturalEn) return naturalEn;

    const en = list.find(v => v.lang.startsWith('en'));
    return en || list[0] || null;
  };

  const updateState = (newState: BlobState) => {
    if (!controlledState) {
      setInternalState(newState);
    }
    onStateChange?.(newState);
  };

  // Blinking logic: Idle (every 4-6s) vs Speaking (frequent friendly blinks every 750ms)
  useEffect(() => {
    let blinkInterval: NodeJS.Timeout;

    if (currentState === 'blob-speaking') {
      // Frequent blinks when speaking as requested: "when it speaks tell it to blink it's eyes"
      blinkInterval = setInterval(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 140);
      }, 750);
    } else {
      // Normal cute periodic blinks during idle / user-speaking / thinking
      blinkInterval = setInterval(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 160);
      }, 3800 + Math.random() * 2200);
    }

    return () => clearInterval(blinkInterval);
  }, [currentState]);

  // Audio Speech synthesis when entering blob-speaking
  useEffect(() => {
    if (currentState === 'blob-speaking') {
      let isCancelled = false;
      setVisibleWordCount(0);

      // Start word-by-word reveal timer
      if (wordIntervalRef.current) clearInterval(wordIntervalRef.current);
      let wordIndex = 1;
      setVisibleWordCount(1);

      // Interval tailored to word length and natural speaking pace (~275ms per word)
      wordIntervalRef.current = setInterval(() => {
        if (wordIndex < words.length) {
          wordIndex++;
          setVisibleWordCount(wordIndex);
        } else {
          if (wordIntervalRef.current) clearInterval(wordIntervalRef.current);
        }
      }, 275);

      // Speak text using browser speech synthesis with nice companion voice
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          // Clean trailing space before question marks for natural speech inflection
          const naturalSpokenText = speechText.replace(/\s+\?/g, '?');
          const utterance = new SpeechSynthesisUtterance(naturalSpokenText);
          const bestVoice = pickBestVoice();
          if (bestVoice) {
            utterance.voice = bestVoice;
          }
          utterance.rate = 0.98; // Engaging, clear, natural tempo
          utterance.pitch = 1.24; // Friendly, curious, warm companion pitch

          // Word boundary hook for browsers that support it
          utterance.onboundary = (e: SpeechSynthesisEvent) => {
            if (e.name === 'word') {
              setVisibleWordCount((prev) => Math.max(prev, Math.min(prev + 1, words.length)));
            }
          };

          utterance.onend = () => {
            if (!isCancelled) {
              if (wordIntervalRef.current) clearInterval(wordIntervalRef.current);
              setVisibleWordCount(words.length);
              setTimeout(() => {
                if (!isCancelled) {
                  updateState('idle');
                  setVisibleWordCount(0);
                  onSpeechEnd?.();
                }
              }, 1200);
            }
          };

          utterance.onerror = () => {
            if (!isCancelled) {
              if (wordIntervalRef.current) clearInterval(wordIntervalRef.current);
              setVisibleWordCount(words.length);
              setTimeout(() => {
                if (!isCancelled) {
                  updateState('idle');
                  setVisibleWordCount(0);
                  onSpeechEnd?.();
                }
              }, 1200);
            }
          };

          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('Speech synthesis error:', e);
        }
      }

      // Safety fallback timer in case speech synthesis fails or is muted
      speechTimeoutRef.current = setTimeout(() => {
        if (!isCancelled) {
          if (wordIntervalRef.current) clearInterval(wordIntervalRef.current);
          setVisibleWordCount(words.length);
          setTimeout(() => {
            if (!isCancelled) {
              updateState('idle');
              setVisibleWordCount(0);
              onSpeechEnd?.();
            }
          }, 1200);
        }
      }, 5500);

      return () => {
        isCancelled = true;
        if (wordIntervalRef.current) clearInterval(wordIntervalRef.current);
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      };
    } else {
      setVisibleWordCount(0);
      if (wordIntervalRef.current) clearInterval(wordIntervalRef.current);
    }
  }, [currentState, speechText]);

  // Handle user speech timer -> transitions to thinking
  useEffect(() => {
    if (currentState === 'user-speaking') {
      // Transition to thinking after 3.2 seconds of user speaking
      userSpeakingTimerRef.current = setTimeout(() => {
        updateState('thinking');
      }, 3200);

      return () => {
        if (userSpeakingTimerRef.current) clearTimeout(userSpeakingTimerRef.current);
      };
    }
  }, [currentState]);

  // Handle thinking timer -> transitions to blob-speaking
  useEffect(() => {
    if (currentState === 'thinking') {
      // Companion thinks with 3 blinking gradient dots on its head for 1.8 seconds
      thinkingTimerRef.current = setTimeout(() => {
        updateState('blob-speaking');
      }, 1800);

      return () => {
        if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
      };
    }
  }, [currentState]);

  // Click handler to speak
  const handleClick = () => {
    if (!interactive) return;

    if (currentState === 'idle') {
      // User clicks it to speak -> enters user-speaking mode
      setIsSquishing(true);
      setTimeout(() => setIsSquishing(false), 300);
      updateState('user-speaking');
    } else if (currentState === 'user-speaking') {
      // User clicks while speaking to finish speaking early -> triggers thinking
      if (userSpeakingTimerRef.current) clearTimeout(userSpeakingTimerRef.current);
      updateState('thinking');
    } else if (currentState === 'thinking') {
      // User clicks during thinking -> immediately starts speaking
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
      updateState('blob-speaking');
    } else if (currentState === 'blob-speaking') {
      // User clicks while blob is speaking -> cancel and reset to idle
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      updateState('idle');
    }
  };

  const isRadiating = currentState === 'user-speaking' || currentState === 'thinking' || currentState === 'blob-speaking';

  return (
    <div 
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size * 0.95 }}
    >
      {/* Floating text right above head with disappearing magic (moved down closer to Akara) */}
      <div className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 w-[min(92vw,480px)] flex justify-center pointer-events-none z-30 px-3">
        {currentState === 'blob-speaking' && (
          <p className="text-center font-semibold text-stone-800 text-sm sm:text-base leading-normal tracking-tight min-h-[1.5rem] flex items-center justify-center">
            <AnimatePresence mode="popLayout">
              {currentChunk.map((word, relIdx) => {
                const absIdx = startWordIdx + relIdx;
                return (
                  <motion.span
                    key={`word-${absIdx}`}
                    initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -6, filter: 'blur(3px)', transition: { duration: 0.2 } }}
                    transition={{ duration: 0.18 }}
                    className="inline-block mr-1.5 whitespace-nowrap"
                  >
                    {word}
                  </motion.span>
                );
              })}
            </AnimatePresence>
          </p>
        )}
      </div>

      {/* 1. Ambient Background Glow - Includes Wide Horizontal Elliptical Side Glow to eliminate empty sides */}
      <div 
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(94vw,720px)] sm:w-[840px] md:w-[980px] lg:w-[1120px] h-[340px] sm:h-[380px] rounded-full blur-3xl sm:blur-[80px] opacity-45 pointer-events-none transition-all duration-700"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(255, 140, 220, 0.28) 0%, rgba(200, 160, 255, 0.22) 35%, rgba(190, 210, 255, 0.14) 62%, transparent 88%)',
        }}
      />
      <div 
        className="absolute inset-0 rounded-full blur-3xl opacity-60 pointer-events-none transition-all duration-700"
        style={{
          background: 'radial-gradient(circle, rgba(255, 120, 225, 0.35) 0%, rgba(195, 175, 255, 0.3) 45%, rgba(255, 160, 240, 0.15) 70%, transparent 85%)',
          transform: 'scale(1.15)',
        }}
      />

      {/* 2. RADIATED GRADIENT EFFECT BEHIND THE BLOB - EXTENDED WIDE TOWARDS SIDES */}
      <AnimatePresence>
        {isRadiating && (
          <>
            {/* Expansive Wide Horizontal Side Bloom reaching across the entire stage */}
            <motion.div
              key="wide-side-bloom"
              initial={{ opacity: 0, scaleX: 0.85, scaleY: 0.9 }}
              animate={{
                scaleX: [1, 1.14, 1],
                scaleY: [1, 1.06, 1],
                opacity: [0.75, 0.95, 0.75],
              }}
              exit={{ opacity: 0, scaleX: 0.85, transition: { duration: 0.6 } }}
              transition={{
                repeat: Infinity,
                duration: 2.8,
                ease: 'easeInOut',
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,840px)] sm:w-[960px] md:w-[1120px] lg:w-[1240px] h-[380px] sm:h-[440px] rounded-full blur-[70px] sm:blur-[90px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 75% 55% at 50% 50%, rgba(255, 110, 210, 0.48) 0%, rgba(192, 132, 252, 0.40) 30%, rgba(147, 197, 253, 0.28) 60%, rgba(244, 114, 182, 0.12) 80%, transparent 96%)',
              }}
            />

            {/* Secondary atmospheric horizontal pulse */}
            <motion.div
              key="wide-side-pulse"
              animate={{
                scaleX: [0.92, 1.18],
                scaleY: [0.95, 1.10],
                opacity: [0.55, 0],
              }}
              transition={{
                repeat: Infinity,
                duration: 2.4,
                ease: 'easeOut',
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(94vw,760px)] sm:w-[880px] md:w-[1040px] lg:w-[1160px] h-[350px] sm:h-[400px] rounded-full blur-[60px] sm:blur-[80px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(244, 114, 182, 0.4) 0%, rgba(168, 85, 247, 0.25) 45%, transparent 75%)',
              }}
            />

            {/* Primary Radiating Gradient Core Aura */}
            <motion.div
              key="radiant-core"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                scale: [1.1, 1.45, 1.1],
                opacity: [0.6, 0.9, 0.6],
                rotate: [0, 90, 180, 270, 360],
              }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.5 } }}
              transition={{
                scale: { repeat: Infinity, duration: 2.2, ease: 'easeInOut' },
                opacity: { repeat: Infinity, duration: 2.2, ease: 'easeInOut' },
                rotate: { repeat: Infinity, duration: 10, ease: 'linear' },
              }}
              className="absolute inset-0 rounded-full blur-3xl pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(255, 105, 225, 0.65) 0%, rgba(168, 85, 247, 0.5) 40%, rgba(99, 102, 241, 0.35) 70%, transparent 88%)',
                transform: 'scale(1.25)',
              }}
            />

            {/* Expanding Gradient Wave 1 */}
            <motion.div
              key="radiant-wave-1"
              animate={{
                scale: [0.95, 1.65],
                opacity: [0.75, 0],
              }}
              transition={{
                repeat: Infinity,
                duration: 2.0,
                ease: 'easeOut',
              }}
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(255, 130, 235, 0.45) 0%, rgba(192, 132, 252, 0.3) 50%, transparent 75%)',
              }}
            />

            {/* Expanding Gradient Wave 2 (Staggered) */}
            <motion.div
              key="radiant-wave-2"
              animate={{
                scale: [0.95, 1.65],
                opacity: [0.75, 0],
              }}
              transition={{
                repeat: Infinity,
                duration: 2.0,
                delay: 1.0,
                ease: 'easeOut',
              }}
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(244, 114, 182, 0.4) 0%, rgba(129, 140, 248, 0.25) 50%, transparent 75%)',
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* 3. BLOB CONTAINER WITH SCALE UP & SCALE DOWN ANIMATION AS USER SPEAKS */}
      <motion.div
        animate={
          currentState === 'user-speaking'
            ? {
                // Scale up and scale down animation as user speaks
                scale: [1, 1.09, 0.98, 1.07, 1],
                y: [0, -6, 2, -4, 0],
              }
            : currentState === 'thinking'
            ? {
                // Gentle thoughtful float when thinking
                scale: [1, 1.03, 1],
                y: [0, -5, 0],
                rotate: [0, 1.5, -1.5, 0],
              }
            : currentState === 'blob-speaking'
            ? {
                // Gentle rhythmic pulse as blob speaks
                scale: [1, 1.04, 0.99, 1.03, 1],
                y: [0, -4, 0, -3, 0],
              }
            : {
                // Idle breathing & floating
                y: [0, -8, 0],
                scaleY: isSquishing ? 0.92 : [1, 1.015, 1],
                scaleX: isSquishing ? 1.07 : [1, 0.99, 1],
              }
        }
        transition={
          currentState === 'user-speaking'
            ? {
                repeat: Infinity,
                duration: 1.8,
                ease: 'easeInOut',
              }
            : currentState === 'thinking'
            ? {
                repeat: Infinity,
                duration: 1.6,
                ease: 'easeInOut',
              }
            : currentState === 'blob-speaking'
            ? {
                repeat: Infinity,
                duration: 1.5,
                ease: 'easeInOut',
              }
            : {
                y: { repeat: Infinity, duration: 3.4, ease: 'easeInOut' },
                scaleY: isSquishing ? { duration: 0.22 } : { repeat: Infinity, duration: 3.4, ease: 'easeInOut' },
                scaleX: isSquishing ? { duration: 0.22 } : { repeat: Infinity, duration: 3.4, ease: 'easeInOut' },
              }
        }
        onClick={handleClick}
        className={`relative flex items-center justify-center ${interactive ? 'cursor-pointer' : ''}`}
        style={{ width: size, height: size * 0.95 }}
      >
        <svg
          viewBox="0 0 300 290"
          className="w-full h-full drop-shadow-[0_16px_30px_rgba(210,130,220,0.35)] overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Thinking Dots Gradient matching blob's ethereal lilac to radiant pink */}
            <linearGradient id="thinkingDotGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#DFDCF9" />
              <stop offset="40%" stopColor="#C9C2F8" />
              <stop offset="100%" stopColor="#FF68D7" />
            </linearGradient>

            {/* Main Body Gradient: Ethereal Milky Lilac (top) to Radiant Bubblegum Pink (bottom) */}
            <linearGradient id="blobBodyGradient" x1="150" y1="65" x2="150" y2="280" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#DFDCF9" />
              <stop offset="28%" stopColor="#C9C2F8" />
              <stop offset="52%" stopColor="#E2A6F3" />
              <stop offset="78%" stopColor="#FF68D7" />
              <stop offset="100%" stopColor="#FF77DF" />
            </linearGradient>

            {/* Bottom Glow: Soft white-pink luminescence */}
            <radialGradient id="bottomPinkLuminescence" cx="50%" cy="88%" r="48%" fx="50%" fy="90%">
              <stop offset="0%" stopColor="#FFA6E9" stopOpacity="0.85" />
              <stop offset="45%" stopColor="#FF70D9" stopOpacity="0.6" />
              <stop offset="85%" stopColor="#E498F5" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#D5C5F8" stopOpacity="0" />
            </radialGradient>

            {/* Top Soft Lilac Glow */}
            <radialGradient id="topLilacGlow" cx="50%" cy="32%" r="40%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
              <stop offset="50%" stopColor="#EBE7FE" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#C9C2F8" stopOpacity="0" />
            </radialGradient>

            {/* Translucent rim stroke */}
            <linearGradient id="blobRimGradient" x1="60" y1="70" x2="240" y2="280" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="35%" stopColor="#E8E2FF" stopOpacity="0.6" />
              <stop offset="70%" stopColor="#FFA4EB" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.85" />
            </linearGradient>

            {/* Crown / Top Tuft gradient */}
            <linearGradient id="tuftGradient" x1="150" y1="52" x2="150" y2="76" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C6BEF7" />
              <stop offset="60%" stopColor="#D9D4FA" />
              <stop offset="100%" stopColor="#DFDCF9" />
            </linearGradient>

            {/* Eye & Mouth Cerulean Blue Gradient */}
            <linearGradient id="faceBlueGradient" x1="150" y1="110" x2="150" y2="205" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2269D2" />
              <stop offset="100%" stopColor="#2E79EA" />
            </linearGradient>
          </defs>

          {/* 1. TOP CREST / DUAL-PEAKED TUFT */}
          <path
            d="M124 74
               C126 62, 134 52, 140 52
               C145 52, 148 60, 150 60
               C152 60, 155 52, 160 52
               C166 52, 174 62, 176 74
               Z"
            fill="url(#tuftGradient)"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeOpacity="0.75"
          />

          {/* 3 BLINKING SAME-GRADIENT DOTS ON ITS HEAD WHEN THINKING */}
          {currentState === 'thinking' && (
            <g id="thinking-head-dots">
              {/* Dot 1 */}
              <motion.circle
                cx="132"
                cy="38"
                r="5.5"
                fill="url(#thinkingDotGradient)"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                strokeOpacity="0.85"
                animate={{
                  opacity: [0.2, 1, 0.2],
                  scale: [0.75, 1.25, 0.75],
                  y: [0, -4, 0],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.9,
                  delay: 0,
                  ease: 'easeInOut',
                }}
                style={{ transformOrigin: '132px 38px' }}
              />

              {/* Dot 2 (Center) */}
              <motion.circle
                cx="150"
                cy="31"
                r="6.5"
                fill="url(#thinkingDotGradient)"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                strokeOpacity="0.9"
                animate={{
                  opacity: [0.2, 1, 0.2],
                  scale: [0.75, 1.25, 0.75],
                  y: [0, -4, 0],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.9,
                  delay: 0.22,
                  ease: 'easeInOut',
                }}
                style={{ transformOrigin: '150px 31px' }}
              />

              {/* Dot 3 */}
              <motion.circle
                cx="168"
                cy="38"
                r="5.5"
                fill="url(#thinkingDotGradient)"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                strokeOpacity="0.85"
                animate={{
                  opacity: [0.2, 1, 0.2],
                  scale: [0.75, 1.25, 0.75],
                  y: [0, -4, 0],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.9,
                  delay: 0.44,
                  ease: 'easeInOut',
                }}
                style={{ transformOrigin: '168px 38px' }}
              />
            </g>
          )}

          {/* 2. CHUBBY DUMPLING BLOB BODY */}
          <path
            d="M150 70
               C190 70, 222 80, 250 112
               C276 144, 284 182, 280 214
               C276 244, 250 270, 214 280
               C176 290, 124 290, 86 280
               C50 270, 24 244, 20 214
               C16 182, 24 144, 50 112
               C78 80, 110 70, 150 70 Z"
            fill="url(#blobBodyGradient)"
          />

          {/* Upper Soft Lilac Glow Overlay */}
          <path
            d="M150 70
               C190 70, 222 80, 250 112
               C276 144, 284 182, 280 214
               C276 244, 250 270, 214 280
               C176 290, 124 290, 86 280
               C50 270, 24 244, 20 214
               C16 182, 24 144, 50 112
               C78 80, 110 70, 150 70 Z"
            fill="url(#topLilacGlow)"
          />

          {/* Bottom Vibrant Pink Glow Overlay */}
          <path
            d="M150 70
               C190 70, 222 80, 250 112
               C276 144, 284 182, 280 214
               C276 244, 250 270, 214 280
               C176 290, 124 290, 86 280
               C50 270, 24 244, 20 214
               C16 182, 24 144, 50 112
               C78 80, 110 70, 150 70 Z"
            fill="url(#bottomPinkLuminescence)"
          />

          {/* Translucent rim stroke for glassy jelly depth */}
          <path
            d="M150 70
               C190 70, 222 80, 250 112
               C276 144, 284 182, 280 214
               C276 244, 250 270, 214 280
               C176 290, 124 290, 86 280
               C50 270, 24 244, 20 214
               C16 182, 24 144, 50 112
               C78 80, 110 70, 150 70 Z"
            stroke="url(#blobRimGradient)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* 3. FACIAL EXPRESSION - THINNER EYES & SMALLER EXPRESSION */}
          <g>
            {/* Left Eye: Thinner, smaller capsule */}
            {isBlinking ? (
              <line
                x1="108"
                y1="133"
                x2="128"
                y2="133"
                stroke="url(#faceBlueGradient)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            ) : (
              <rect
                x="113"
                y="118"
                width="11"
                height="30"
                rx="5.5"
                fill="url(#faceBlueGradient)"
              />
            )}

            {/* Right Eye: Thinner, smaller capsule */}
            {isBlinking ? (
              <line
                x1="172"
                y1="133"
                x2="192"
                y2="133"
                stroke="url(#faceBlueGradient)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            ) : (
              <rect
                x="176"
                y="118"
                width="11"
                height="30"
                rx="5.5"
                fill="url(#faceBlueGradient)"
              />
            )}

            {/* Mouth: Transforms to a circle as it speaks */}
            {currentState === 'blob-speaking' ? (
              /* Animated Speaking Mouth (Calm, natural talking rhythm) */
              <motion.ellipse
                cx="150"
                cy="183"
                animate={{
                  rx: [7, 8.8, 7.2, 8.5, 7],
                  ry: [8, 11.5, 8.5, 11, 8],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.86,
                  ease: 'easeInOut',
                }}
                fill="url(#faceBlueGradient)"
              />
            ) : (
              /* Smaller, gentle warm smile arc when not speaking */
              <path
                d="M132 181
                   C139 196, 161 196, 168 181"
                fill="none"
                stroke="url(#faceBlueGradient)"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        </svg>
      </motion.div>
    </div>
  );
};

