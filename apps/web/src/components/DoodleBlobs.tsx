import React from 'react';
import { motion } from 'motion/react';

interface DoodleBlobsProps {
  onKeywordClick?: (keyword: string) => void;
}

/**
 * Hand-drawn sketchy doodle speech bubbles and comic bursts from the original sketchbook aesthetic.
 * Positioned snugly around Akara without borders or extra containers.
 * Clean text only (no emojis/illustrations): Learn, Understand, Explain, Key Words, Language.
 */
export function DoodleBlobs({ onKeywordClick }: DoodleBlobsProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-10 flex items-center justify-center">
      <div className="relative w-full max-w-2xl sm:max-w-3xl h-full min-h-[460px] pointer-events-none">
        {/* 1. TOP-LEFT: Warm Orange Elongated Doodle Bubble ("Learn") */}
        <motion.div
          className="absolute top-2 left-2 sm:top-4 sm:left-8 md:top-6 md:left-12 pointer-events-auto cursor-pointer select-none"
          initial={{ opacity: 0, scale: 0.85, rotate: -4 }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            y: [0, -5, 0],
            rotate: [-4, -2, -4]
          }}
          transition={{
            y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
            opacity: { duration: 0.4 }
          }}
          whileHover={{ scale: 1.07, rotate: -1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onKeywordClick?.('Learn')}
        >
          <div className="relative w-28 sm:w-36 md:w-40 filter drop-shadow-[0_4px_10px_rgba(245,158,11,0.22)]">
            <svg viewBox="0 0 200 90" className="w-full h-auto overflow-visible" fill="none">
              {/* Hand-drawn sketchy outline and fill */}
              <path
                d="M18 42 C16 22, 35 12, 95 10 C155 8, 185 18, 188 38 C192 60, 165 72, 115 74 C90 75, 55 76, 38 86 C40 76, 35 73, 25 68 C16 60, 15 50, 18 42 Z"
                fill="#FCA446"
                stroke="#E88725"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Sketchy crayon strokes */}
              <path
                d="M30 25 C70 18, 140 18, 170 28"
                stroke="#FFF2DC"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeDasharray="4 6"
                opacity="0.75"
              />
              <path
                d="M35 58 C75 64, 130 63, 165 56"
                stroke="#D9700E"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeDasharray="6 8"
                opacity="0.45"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-1">
              <span className="font-extrabold tracking-wide text-xs sm:text-sm md:text-base text-[#682A00] font-sans">
                Learn
              </span>
            </div>
          </div>
        </motion.div>

        {/* 2. TOP-RIGHT: Sky Blue Fluffy Cloud Bubble ("Understand") */}
        <motion.div
          className="absolute top-2 right-2 sm:top-4 sm:right-8 md:top-6 md:right-12 pointer-events-auto cursor-pointer select-none"
          initial={{ opacity: 0, scale: 0.85, rotate: 3 }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            y: [0, 6, 0],
            rotate: [3, 5, 3]
          }}
          transition={{
            y: { duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
            rotate: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' },
            opacity: { duration: 0.4, delay: 0.1 }
          }}
          whileHover={{ scale: 1.07, rotate: 1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onKeywordClick?.('Understand')}
        >
          <div className="relative w-32 sm:w-40 md:w-44 filter drop-shadow-[0_4px_12px_rgba(56,189,248,0.25)]">
            <svg viewBox="0 0 210 110" className="w-full h-auto overflow-visible" fill="none">
              <path
                d="M48 76 C32 76, 18 64, 20 48 C22 34, 36 26, 52 28 C60 14, 82 8, 106 12 C126 6, 154 12, 164 26 C180 24, 196 34, 194 50 C194 66, 178 78, 160 76 C152 86, 134 92, 112 88 C94 92, 68 90, 52 82 C44 94, 38 98, 30 102 C34 94, 38 88, 48 76 Z"
                fill="#7ECBF2"
                stroke="#4FAFE0"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M60 26 C75 18, 98 18, 114 20"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.8"
              />
              <path
                d="M136 24 C148 22, 164 28, 170 36"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
                opacity="0.8"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-2">
              <span className="font-extrabold tracking-wide text-xs sm:text-sm md:text-base text-[#074768] font-sans">
                Understand
              </span>
            </div>
          </div>
        </motion.div>

        {/* 3. MID-LEFT: Dynamic Electric Blue Starburst ("Explain") */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 left-0 sm:left-4 md:left-8 pointer-events-auto cursor-pointer select-none hidden xs:block"
          initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            y: [0, -4, 0],
            rotate: [-8, -5, -8]
          }}
          transition={{
            y: { duration: 3.8, repeat: Infinity, ease: 'easeInOut', delay: 0.7 },
            rotate: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
            opacity: { duration: 0.4, delay: 0.2 }
          }}
          whileHover={{ scale: 1.08, rotate: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onKeywordClick?.('Explain')}
        >
          <div className="relative w-28 sm:w-36 md:w-38 filter drop-shadow-[0_4px_12px_rgba(2,132,199,0.28)]">
            <svg viewBox="0 0 180 140" className="w-full h-auto overflow-visible" fill="none">
              <path
                d="M88 12 L106 36 L138 22 L132 52 L168 56 L144 80 L172 102 L138 108 L142 136 L112 120 L94 138 L84 116 L56 132 L64 104 L30 102 L52 78 L20 58 L54 50 L42 22 L76 34 Z"
                fill="#1B88DF"
                stroke="#1068AD"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="M74 44 L90 56 L116 46 L112 68 L134 72 L116 88 L126 102"
                stroke="#95D1FF"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.6"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-black tracking-wider text-xs sm:text-sm md:text-base text-white uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)] font-sans">
                Explain
              </span>
            </div>
          </div>
        </motion.div>

        {/* 4. BOTTOM-LEFT: Soft Pink Sketchy Banner ("Key Words") */}
        <motion.div
          className="absolute bottom-2 left-2 sm:bottom-4 sm:left-8 md:bottom-6 md:left-12 pointer-events-auto cursor-pointer select-none"
          initial={{ opacity: 0, scale: 0.85, rotate: 2 }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            y: [0, 5, 0],
            rotate: [2, 0, 2]
          }}
          transition={{
            y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1.1 },
            rotate: { duration: 5.2, repeat: Infinity, ease: 'easeInOut' },
            opacity: { duration: 0.4, delay: 0.3 }
          }}
          whileHover={{ scale: 1.07, rotate: 4 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onKeywordClick?.('Key Words')}
        >
          <div className="relative w-30 sm:w-38 md:w-42 filter drop-shadow-[0_4px_10px_rgba(244,114,182,0.22)]">
            <svg viewBox="0 0 190 75" className="w-full h-auto overflow-visible" fill="none">
              <path
                d="M16 14 C48 10, 142 12, 172 16 C184 20, 186 36, 182 50 C178 62, 160 64, 120 64 C90 65, 50 64, 32 72 C35 64, 30 62, 20 60 C8 58, 6 42, 8 28 C10 18, 12 14, 16 14 Z"
                fill="#F7B4CE"
                stroke="#DF81A4"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M26 24 C55 20, 130 22, 162 26"
                stroke="#FFF0F5"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.85"
              />
              <path
                d="M30 52 C70 54, 125 53, 155 48"
                stroke="#C95F87"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeDasharray="4 6"
                opacity="0.4"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-0.5">
              <span className="font-extrabold tracking-wide text-xs sm:text-sm md:text-base text-[#7B1B47] font-sans">
                Key Words
              </span>
            </div>
          </div>
        </motion.div>

        {/* 5. MID-RIGHT: Sunny Yellow Hand-Drawn Oval ("Language") */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 right-0 sm:right-4 md:right-8 pointer-events-auto cursor-pointer select-none hidden xs:block"
          initial={{ opacity: 0, scale: 0.85, rotate: 4 }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            y: [0, -5, 0],
            rotate: [4, 6, 4]
          }}
          transition={{
            y: { duration: 4.6, repeat: Infinity, ease: 'easeInOut', delay: 0.9 },
            rotate: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
            opacity: { duration: 0.4, delay: 0.4 }
          }}
          whileHover={{ scale: 1.07, rotate: 2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onKeywordClick?.('Language')}
        >
          <div className="relative w-30 sm:w-36 md:w-40 filter drop-shadow-[0_4px_12px_rgba(250,204,21,0.25)]">
            <svg viewBox="0 0 190 95" className="w-full h-auto overflow-visible" fill="none">
              <path
                d="M26 44 C22 24, 48 12, 100 12 C152 12, 174 25, 172 46 C170 66, 142 78, 95 78 C70 78, 50 82, 34 92 C38 82, 32 78, 22 72 C16 64, 18 52, 26 44 Z"
                fill="#FAE34C"
                stroke="#D8BF22"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M45 25 C75 18, 125 18, 150 26"
                stroke="#FFFFEE"
                strokeWidth="2.2"
                strokeLinecap="round"
                opacity="0.9"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-1">
              <span className="font-extrabold tracking-wide text-xs sm:text-sm md:text-base text-[#685303] font-sans">
                Language
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
