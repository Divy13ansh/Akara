import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TopicGroup, ConceptNode } from '../services/constellationData';
import { Check, Lock, Play } from 'lucide-react';
import { handleImageFallback } from './CardThemeUtils';

interface ConstellationPathProps {
  topics: TopicGroup[];
  onSelectConcept: (concept: ConceptNode) => void;
  selectedConceptId?: string;
  recentlyMasteredId?: string;
}

// Formats concept titles: exactly 3 words on line 1, remainder on line 2 (e.g. "Kinematic Equations of" / "Motion")
function renderConceptName(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length <= 3) {
    return <span className="block whitespace-nowrap">{name}</span>;
  }
  const firstLine = words.slice(0, 3).join(' ');
  const secondLine = words.slice(3).join(' ');
  return (
    <>
      <span className="block whitespace-nowrap">{firstLine}</span>
      <span className="block whitespace-nowrap">{secondLine}</span>
    </>
  );
}

// 8-node cycle with wide horizontal amplitude for an organic, spaced-out S-curve
// Consecutive nodes have 14% to 22% horizontal separation (120px-180px on desktop)
const WAVE_PATTERN: Array<{ x: number; textSide: 'left' | 'right' }> = [
  { x: 62, textSide: 'right' }, // 0: Upper right (text on right)
  { x: 84, textSide: 'left' },  // 1: Far right apex (+22% delta, text on left towards inside)
  { x: 64, textSide: 'right' }, // 2: Upper right inner (-20% delta, text on right)
  { x: 44, textSide: 'left' },  // 3: Center transition (-20% delta, text on left)
  { x: 26, textSide: 'right' }, // 4: Center-left (-18% delta, text on right into center)
  { x: 12, textSide: 'right' }, // 5: Far left apex (-14% delta, text on right into inside)
  { x: 28, textSide: 'left' },  // 6: Lower left inner (+16% delta, text on left)
  { x: 48, textSide: 'right' }, // 7: Return to center (+20% delta, text on right)
  // Return wave for chapters with 8+ concepts:
  { x: 68, textSide: 'left' },  // 8: Center-right (+20% delta, text on left)
  { x: 84, textSide: 'left' },  // 9: Far right apex (+16% delta, text on left)
  { x: 64, textSide: 'right' }, // 10: Right inner (-20% delta, text on right)
  { x: 44, textSide: 'left' },  // 11: Center (-20% delta, text on left)
  { x: 26, textSide: 'right' }, // 12: Center-left (-18% delta, text on right)
  { x: 12, textSide: 'right' }, // 13: Far left apex (-14% delta, text on right)
  { x: 28, textSide: 'left' },  // 14: Lower left inner (+16% delta, text on left)
  { x: 48, textSide: 'right' }, // 15: Return (+20% delta, text on right)
];

export function ConstellationPath({
  topics,
  onSelectConcept,
  selectedConceptId,
  recentlyMasteredId,
}: ConstellationPathProps) {
  // Flatten all concepts from topics in order to form the continuous single path
  const concepts = topics.flatMap((t) => t.concepts);
  const totalConcepts = concepts.length;

  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Array<{ x: number; y: number }>>([]);

  // Dynamically compute exact center coordinates of each node in the container
  useEffect(() => {
    let animId: number;
    const updatePositions = () => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const positions: Array<{ x: number; y: number }> = [];

      for (const c of concepts) {
        const el = document.getElementById(`concept-node-${c.id}`);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        positions.push({
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top,
        });
      }

      if (positions.length === concepts.length) {
        setNodePositions(positions);
      }
    };

    // Run multiple times during mounting to capture initial render and any fonts/styles loading
    animId = requestAnimationFrame(updatePositions);
    const timer1 = setTimeout(updatePositions, 50);
    const timer2 = setTimeout(updatePositions, 200);

    const resizeObserver = new ResizeObserver(() => {
      updatePositions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener('resize', updatePositions);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePositions);
    };
  }, [concepts]);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-4xl mx-auto select-none [--row-h:120px] [--start-y:60px] sm:[--row-h:135px] sm:[--start-y:70px] md:[--row-h:150px] md:[--start-y:80px] [--wave-scale:0.85] sm:[--wave-scale:0.95] md:[--wave-scale:1]"
      style={{
        height: `calc(var(--start-y) + ${Math.max(0, totalConcepts - 1)} * var(--row-h) + 64px)`,
      }}
    >
      {/* CURVY CONNECTING PATHS BETWEEN NODES */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="pathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#166534" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6d0e00" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {(() => {
          if (nodePositions.length !== concepts.length || nodePositions.length < 2) return null;

          const n = nodePositions.length;
          // Calculate smooth tangent vectors for all nodes to achieve C1 continuous curvature
          // For node 0 and n-1, tangents point vertically into/out of the path
          // For intermediate nodes, tangent is collinear with the chord between prev and next nodes,
          // ensuring seamless flow through every node with zero sharp kinks or awkward inflection loops.
          const tangents: Array<{ x: number; y: number }> = [];

          for (let i = 0; i < n; i++) {
            if (i === 0) {
              const dx = nodePositions[1].x - nodePositions[0].x;
              const dy = nodePositions[1].y - nodePositions[0].y;
              // Start cleanly flowing downwards with gentle lateral direction
              tangents.push({ x: dx * 0.4, y: Math.max(dy * 0.85, 30) });
            } else if (i === n - 1) {
              const dx = nodePositions[n - 1].x - nodePositions[n - 2].x;
              const dy = nodePositions[n - 1].y - nodePositions[n - 2].y;
              // End cleanly flowing into final node
              tangents.push({ x: dx * 0.4, y: Math.max(dy * 0.85, 30) });
            } else {
              const prev = nodePositions[i - 1];
              const next = nodePositions[i + 1];
              // Collinear tangent vector using central difference (prev -> next)
              const chordX = next.x - prev.x;
              const chordY = next.y - prev.y;
              const chordDist = Math.hypot(chordX, chordY);

              if (chordDist > 0.001) {
                // Unit tangent scaled proportionally
                tangents.push({
                  x: chordX / chordDist,
                  y: Math.max(0.2, chordY / chordDist), // Ensure downward progression
                });
              } else {
                tangents.push({ x: 0, y: 1 });
              }
            }
          }

          return nodePositions.slice(0, -1).map((startPos, i) => {
            const endPos = nodePositions[i + 1];
            const startConcept = concepts[i];
            const nextConcept = concepts[i + 1];

            const segmentDist = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y);
            const tension = segmentDist * 0.38;

            let cp1x: number;
            let cp1y: number;
            let cp2x: number;
            let cp2y: number;

            if (i === 0) {
              cp1x = startPos.x + tangents[0].x;
              cp1y = startPos.y + tangents[0].y * 0.55;
            } else {
              cp1x = startPos.x + tangents[i].x * tension;
              cp1y = startPos.y + tangents[i].y * tension;
            }

            if (i + 1 === n - 1) {
              cp2x = endPos.x - tangents[n - 1].x;
              cp2y = endPos.y - tangents[n - 1].y * 0.55;
            } else {
              cp2x = endPos.x - tangents[i + 1].x * tension;
              cp2y = endPos.y - tangents[i + 1].y * tension;
            }

            // Ensure control points always flow downward so the curve never loops backward vertically
            const minY = Math.min(startPos.y, endPos.y);
            const maxY = Math.max(startPos.y, endPos.y);
            cp1y = Math.min(Math.max(cp1y, minY), maxY);
            cp2y = Math.min(Math.max(cp2y, minY), maxY);

            const d = `M ${startPos.x} ${startPos.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endPos.x} ${endPos.y}`;

            // Path color based on progression
            const isCompletedSegment = startConcept.status === 'mastered' && nextConcept.status === 'mastered';
            const isActiveSegment = startConcept.status === 'mastered' && nextConcept.status !== 'locked';

            const strokeColor = isCompletedSegment
              ? '#166534'
              : isActiveSegment
              ? '#15803d'
              : '#d6d3d1';

            return (
              <g key={`path-${startConcept.id}-${nextConcept.id}`}>
                {/* Subtle outer backdrop stroke for clean background contrast */}
                <path
                  d={d}
                  fill="none"
                  stroke="rgba(246, 244, 240, 0.95)"
                  strokeWidth={9}
                  strokeLinecap="round"
                />
                {/* Main curvy connector line */}
                <path
                  d={d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isCompletedSegment ? 3.5 : 2.5}
                  strokeDasharray={isCompletedSegment ? undefined : '6 6'}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                  opacity={isCompletedSegment ? 0.9 : 0.75}
                />
              </g>
            );
          });
        })()}
      </svg>
      {/* 1. CHARACTER ON PENCIL ILLUSTRATION - TOP LEFT CORNER */}
      {/* Moved further left towards the edge, pushed slightly down, scaled down slightly */}
      <div
        className="absolute -left-10 sm:-left-16 md:-left-28 lg:-left-44 xl:-left-52 -translate-y-1/4 pointer-events-none z-0 select-none"
        style={{
          top: 'calc(var(--start-y) + 0.45 * var(--row-h))',
        }}
      >
        <motion.div
          animate={{
            y: [-10, 10, -10],
          }}
          transition={{
            repeat: Infinity,
            duration: 4.5,
            ease: "easeInOut",
          }}
        >
          <img
            src="/character_pencil.png"
            alt="Student on pencil illustration"
            className="w-56 sm:w-72 md:w-[360px] lg:w-[410px] xl:w-[450px] max-w-[42vw] h-auto object-contain drop-shadow-sm select-none scale-x-[-1]"
            loading="eager"
            onError={(e) => handleImageFallback(e)}
          />
        </motion.div>
      </div>

      {/* 2. CHARACTER ON PENCIL ILLUSTRATION - BOTTOM RIGHT CORNER */}
      {/* Moved further right towards the edge, scaled down slightly */}
      {totalConcepts >= 5 && (
        <div
          className="absolute -right-10 sm:-right-16 md:-right-28 lg:-right-44 xl:-right-52 -translate-y-1/4 pointer-events-none z-0 select-none"
          style={{
            top: `calc(var(--start-y) + ${Math.min(4.8, Math.max(2.8, totalConcepts - 3.4))} * var(--row-h))`,
          }}
        >
          <motion.div
            animate={{
              y: [10, -10, 10],
            }}
            transition={{
              repeat: Infinity,
              duration: 4.8,
              ease: "easeInOut",
              delay: 0.5,
            }}
          >
            <img
              src="/character_pencil.png"
              alt="Student on pencil illustration"
              className="w-56 sm:w-72 md:w-[360px] lg:w-[410px] xl:w-[450px] max-w-[42vw] h-auto object-contain drop-shadow-sm select-none"
              loading="lazy"
              onError={(e) => handleImageFallback(e)}
            />
          </motion.div>
        </div>
      )}

      {/* 3. OPTIONAL THIRD CHARACTER IF CHAPTER IS LONG (12+ CONCEPTS) - FAR LEFT CORNER */}
      {totalConcepts >= 13 && (
        <div
          className="absolute -left-10 sm:-left-16 md:-left-28 lg:-left-44 xl:-left-52 -translate-y-1/4 pointer-events-none z-0 select-none"
          style={{
            top: 'calc(var(--start-y) + 11.2 * var(--row-h))',
          }}
        >
          <motion.div
            animate={{
              y: [-10, 10, -10],
            }}
            transition={{
              repeat: Infinity,
              duration: 4.2,
              ease: "easeInOut",
              delay: 0.2,
            }}
          >
            <img
              src="/character_pencil.png"
              alt="Student on pencil illustration"
              className="w-56 sm:w-72 md:w-[360px] lg:w-[410px] xl:w-[450px] max-w-[42vw] h-auto object-contain drop-shadow-sm select-none scale-x-[-1]"
              loading="lazy"
              onError={(e) => handleImageFallback(e)}
            />
          </motion.div>
        </div>
      )}

      {/* 4. S-CURVING NODES & FORMATTED TOPIC NAMES */}
      {concepts.map((concept, index) => {
        const pattern = WAVE_PATTERN[index % WAVE_PATTERN.length];
        const isMastered = concept.status === 'mastered';
        const isAvailable = concept.status === 'available';
        const isLocked = !isMastered && !isAvailable; // No timer node - locked with standard padlock

        const isSelected = selectedConceptId === concept.id;
        const isRecentlyMastered = recentlyMasteredId === concept.id;

        // Base X position centered at 50%, offset scaled for screen responsiveness
        const xOffset = pattern.x - 50;

        // Node styling:
        // - Done/Mastered: green circle (#166534) with cream checkmark
        // - Available: #6d0e00 circle with cream play icon
        // - Locked: cream circle (#FAF7F2) with #6d0e00 border and #6d0e00 lock
        let nodeButtonClasses = 'group relative w-16 h-16 sm:w-20 sm:h-20 md:w-22 md:h-22 rounded-full flex items-center justify-center transition-all cursor-pointer focus:outline-none';

        if (isMastered) {
          nodeButtonClasses += ' bg-[#166534] text-white shadow-[0_4px_14px_rgba(22,101,52,0.35)] focus-visible:ring-4 focus-visible:ring-[#166534]/40';
        } else if (isAvailable) {
          nodeButtonClasses += ' bg-[#6d0e00] text-[#FAF7F2] shadow-md focus-visible:ring-4 focus-visible:ring-[#6d0e00]/40';
        } else {
          // Locked
          nodeButtonClasses += ' bg-[#FAF7F2] border-2 sm:border-[2.5px] border-[#6d0e00] text-[#6d0e00] shadow-[0_3px_10px_rgba(109,14,0,0.12)] focus-visible:ring-4 focus-visible:ring-[#6d0e00]/30';
        }

        // Text color:
        // - Done/Mastered (green nodes): green color (#166534)
        // - Rest: existing red/crimson color (#6d0e00)
        const textColorClass = isMastered ? 'text-[#166534]' : 'text-[#6d0e00]';

        return (
          <div
            key={concept.id}
            id={`concept-node-${concept.id}`}
            className="absolute -translate-y-1/2 z-10"
            style={{
              top: `calc(var(--start-y) + ${index} * var(--row-h))`,
              left: `calc(50% + (${xOffset}% * var(--wave-scale)))`,
            }}
          >
            {/* CIRCULAR INTERACTIVE NODE */}
            <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
              <motion.button
                type="button"
                onClick={() => onSelectConcept(concept)}
                animate={
                  isRecentlyMastered
                    ? { scale: [1, 1.15, 1], transition: { duration: 0.5 } }
                    : isSelected
                    ? { scale: 1.08 }
                    : { scale: 1 }
                }
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                className={nodeButtonClasses}
                aria-label={`${concept.name} - ${isMastered ? 'mastered' : isAvailable ? 'available' : 'locked'}`}
              >
                {/* 1. MASTERED: Green circle with cream-colored checkmark */}
                {isMastered && (
                  <Check
                    size={28}
                    strokeWidth={3}
                    className="text-[#FAF7F2] drop-shadow-xs transition-transform group-hover:scale-110"
                  />
                )}

                {/* 2. AVAILABLE: Solid #6d0e00 circle with cream play icon */}
                {isAvailable && (
                  <Play
                    size={24}
                    className="fill-[#FAF7F2] text-[#FAF7F2] ml-0.5 drop-shadow-xs transition-transform group-hover:scale-110"
                  />
                )}

                {/* 3. LOCKED: Cream circle with #6d0e00 border and padlock */}
                {isLocked && (
                  <Lock
                    size={22}
                    strokeWidth={2.4}
                    className="text-[#6d0e00] drop-shadow-xs transition-transform group-hover:scale-105"
                  />
                )}
              </motion.button>
            </div>

            {/* TOPIC/CONCEPT NAME: 3 words on line 1, remainder on line 2 */}
            {/* Alternating left and right alongside each circle */}
            {pattern.textSide === 'right' ? (
              <div
                className="absolute top-0 -translate-y-1/2 left-[40px] sm:left-[50px] md:left-[56px] text-left pointer-events-auto cursor-pointer"
                onClick={() => onSelectConcept(concept)}
              >
                <div className={`font-sans font-semibold text-xs sm:text-sm md:text-base ${textColorClass} leading-snug transition-colors hover:opacity-85`}>
                  {renderConceptName(concept.name)}
                </div>
              </div>
            ) : (
              <div
                className="absolute top-0 -translate-y-1/2 right-[40px] sm:right-[50px] md:right-[56px] text-right pointer-events-auto cursor-pointer"
                onClick={() => onSelectConcept(concept)}
              >
                <div className={`font-sans font-semibold text-xs sm:text-sm md:text-base ${textColorClass} leading-snug transition-colors hover:opacity-85`}>
                  {renderConceptName(concept.name)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

