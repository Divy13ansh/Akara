import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Headphones, 
  FileText, 
  Network, 
  HelpCircle, 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Check, 
  X, 
  ArrowRight, 
  Mic, 
  ShieldCheck, 
  BookOpen,
  CheckCircle2,
  Share2,
  Sparkles,
  Shuffle,
  Clock,
  Plus,
  Minus
} from 'lucide-react';
import { AppNavbar } from '../components/AppNavbar';
import { handleImageFallback } from '../components/CardThemeUtils';
import { 
  conceptMediaService, 
  GeneratedConceptData,
  SceneGraphNode,
  QuizQuestion
} from '../services/conceptMediaService';
import { authService, UserProfile } from '../services/api';

type PracticeMode = 'listen' | 'card' | 'mindmap' | 'quiz';

// 4 Practice Options using uploaded images from the public folder
const PRACTICE_OPTIONS = [
  {
    id: 'listen' as const,
    title: 'Listen',
    badge: 'Audio • Voice',
    description: 'Listen to the audio explanation with playback speed & sound scrub',
    bgClass: 'bg-[#254CE8]',
    cardGradient: 'bg-gradient-to-b from-[#254CE8] via-[#2A50EA] to-[#3E66F9]',
    imageSrc: '/audio.png',
  },
  {
    id: 'card' as const,
    title: 'Concept Card',
    badge: 'Study • Summary',
    description: 'Concise takeaways, core principles & chemical formulas',
    bgClass: 'bg-[#C9381A]',
    cardGradient: 'bg-gradient-to-b from-[#C9381A] via-[#D13E1F] to-[#E54F2E]',
    imageSrc: '/concept_card.png',
  },
  {
    id: 'mindmap' as const,
    title: 'Mind Map',
    badge: 'Visual • Diagram',
    description: 'Interactive scene graph connecting concepts and relationships',
    bgClass: 'bg-[#5B34C8]',
    cardGradient: 'bg-gradient-to-b from-[#5B34C8] via-[#633BD0] to-[#774EE6]',
    imageSrc: '/mind_map.png',
  },
  {
    id: 'quiz' as const,
    title: 'Quick Quiz',
    badge: 'Self-Test • Recall',
    description: 'Interactive questions with instant grading & explanations',
    bgClass: 'bg-[#0B7D58]',
    cardGradient: 'bg-gradient-to-b from-[#0B7D58] via-[#0E855E] to-[#159F72]',
    imageSrc: '/quiz.png',
  },
];

export default function Practice() {
  const { conceptId, mode: pathMode } = useParams<{ conceptId: string; mode?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conceptData, setConceptData] = useState<GeneratedConceptData | null>(null);
  // Media (video/audio bundle) is global per (concept, lang) — when it 404s the
  // render is still in flight, so we show a friendly "getting ready" state and
  // retry instead of an infinite skeleton.
  const [mediaNotReady, setMediaNotReady] = useState(false);

  // Determine if a specific activity is active from path params or query params
  const queryMode = searchParams.get('mode') as PracticeMode | null;
  const rawMode = pathMode || queryMode;
  const activeMode: PracticeMode | null =
    rawMode === 'listen' || rawMode === 'card' || rawMode === 'mindmap' || rawMode === 'quiz'
      ? rawMode
      : null;

  // Context query parameters
  const langParam = searchParams.get('lang') || '';

  // Load unified shared concept data (backend media bundle; lang omitted → profile default).
  // The bundle is shared across all students per (concept, lang): a 404 means
  // the render is still in flight, so poll and retry instead of failing.
  useEffect(() => {
    const targetConceptId = conceptId || 'cr-02';
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setMediaNotReady(false);
      try {
        const profile = await authService.getProfile();
        if (cancelled) return;
        setUser(profile);
        try {
          const data = await conceptMediaService.getGeneratedConceptData(targetConceptId, langParam || undefined);
          if (cancelled) return;
          setConceptData(data);
          setMediaNotReady(false);
        } catch (mediaErr) {
          const { ApiError } = await import('../services/http');
          if (mediaErr instanceof ApiError && mediaErr.status === 404) {
            // Render in flight — poll until it lands, then retry once per poll.
            if (cancelled) return;
            setMediaNotReady(true);
            setLoading(false);
            const pollLang = langParam || undefined;
            try {
              await conceptMediaService.pollGenerationStatus(
                targetConceptId,
                pollLang,
                () => {},
                5000,
                60,
              );
            } catch { /* polling is best-effort */ }
            if (cancelled) return;
            try {
              const data = await conceptMediaService.getGeneratedConceptData(targetConceptId, langParam || undefined);
              if (cancelled) return;
              setConceptData(data);
              setMediaNotReady(false);
            } catch {
              if (!cancelled) setMediaNotReady(true);
            } finally {
              if (!cancelled) setLoading(false);
            }
            return;
          }
          throw mediaErr;
        }
      } catch (err) {
        if (cancelled) return;
        const { parseError } = await import('../services/http');
        setError(parseError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [conceptId, langParam]);

  // Navigate to dedicated activity page
  const handleOpenActivity = (mode: PracticeMode) => {
    const targetId = conceptData?.conceptId || conceptId || 'cr-02';
    const params = new URLSearchParams(searchParams);
    params.delete('mode');
    const queryString = params.toString();
    navigate(`/practice/${targetId}/${mode}${queryString ? `?${queryString}` : ''}`);
  };

  // Back navigation to 4-card games/practice selection area
  const handleBackToActivitiesHub = () => {
    const targetId = conceptData?.conceptId || conceptId || 'cr-02';
    const params = new URLSearchParams(searchParams);
    params.delete('mode');
    const queryString = params.toString();
    navigate(`/practice/${targetId}${queryString ? `?${queryString}` : ''}`);
  };

  // Back navigation to chapter constellation
  const handleBackToConstellation = () => {
    if (conceptData?.subjectId && conceptData?.chapterId) {
      navigate(`/home/${conceptData.subjectId}/${conceptData.chapterId}?concept=${conceptData.conceptId}`);
    } else {
      navigate('/home');
    }
  };

  // Navigate to dominant CTA: Teach it
  const handleExplainItBack = () => {
    if (!conceptData) return;
    const query = new URLSearchParams({
      subject: conceptData.subjectId,
      chapter: conceptData.chapterId,
      lang: conceptData.language,
    }).toString();
    navigate(`/explain/${conceptData.conceptId}?${query}`);
  };

  const activeOption = activeMode
    ? PRACTICE_OPTIONS.find((o) => o.id === activeMode) || PRACTICE_OPTIONS[0]
    : null;

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans text-stone-900 selection:bg-[#6d0e00]/15 selection:text-[#6d0e00]">
      {/* Top Navbar */}
      <AppNavbar user={user} />

      {/* VIEW 1: 4-CARDS GAMES & PRACTICE AREA HUB (No activity below cards) */}
      {!activeMode ? (
        <main className="flex-1 w-full px-8 md:px-12 py-6 sm:py-8 pb-24 md:pb-12 max-w-[1520px] mx-auto">
          {/* Header Section */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-2">
              Practice: {conceptData?.topicName || conceptData?.conceptName || 'Practice'}
            </h1>
            <p className="text-stone-600 text-base sm:text-lg font-medium leading-relaxed">
              Select an activity below to practice and master this concept.
            </p>
            {error && (
              <div role="alert" className="mt-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 max-w-2xl">
                {error} <button type="button" onClick={() => window.location.reload()} className="ml-2 font-bold underline">Retry</button>
              </div>
            )}
            {conceptData?.quizStatus === 'generating' && (
              <div className="mt-3 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 max-w-2xl">
                Your quiz and mind map are almost ready — Listen and Concept Card work now; the rest will unlock shortly (refresh).
              </div>
            )}
          </div>

          {/* 4 CARDS GRID (Using user images with bottom gradient blending into #F6F4F0) */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-7">
            {PRACTICE_OPTIONS.map((opt) => (
              <motion.button
                key={opt.id}
                id={`practice-card-${opt.id}`}
                type="button"
                onClick={() => handleOpenActivity(opt.id)}
                whileHover={{ y: -6 }}
                whileTap={{ scale: 0.98 }}
                className={`group relative overflow-hidden text-left rounded-3xl p-6 sm:p-7 transition-all duration-300 flex flex-col justify-between h-[430px] sm:h-[450px] cursor-pointer shadow-md hover:shadow-xl ${opt.cardGradient}`}
              >
                {/* Card Title & Description */}
                <div className="z-20 relative">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-snug">
                    {opt.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-white/90 font-normal mt-1.5 leading-relaxed">
                    {opt.description}
                  </p>
                </div>

                {/* Uploaded User Image from /public - Enriched and Enlarged */}
                <div className="w-full flex-1 flex items-center justify-center my-3 relative z-10">
                  <img
                    src={opt.imageSrc}
                    alt={opt.title}
                    className="max-h-56 sm:max-h-64 w-auto max-w-full object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                    onError={(e) => handleImageFallback(e)}
                  />
                </div>

                {/* Ambient glow accent */}
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-xl pointer-events-none" />
              </motion.button>
            ))}
          </div>
        </main>
      ) : (
        /* VIEW 2: DEDICATED NEW PAGE FOR THE CHOSEN OPTION */
        <main className={`flex-1 w-full py-6 sm:py-8 pb-24 md:pb-12 mx-auto ${
          activeMode === 'card'
            ? 'px-4 sm:px-6 md:px-8 max-w-[1520px]'
            : 'px-8 md:px-12 max-w-[1520px]'
        }`}>
          {/* Header Section matching Home / Learn layout */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-2">
              {activeMode === 'card'
                ? `Practice: ${conceptData?.topicName || conceptData?.conceptName || activeOption?.title || 'Concept Card'}`
                : activeMode === 'mindmap'
                ? `Mind maps: ${conceptData?.topicName || conceptData?.conceptName || ''}`.trim()
                : `Practice: ${conceptData?.topicName || conceptData?.conceptName || activeOption?.title || 'Practice Activity'}`}
            </h1>
            <p className="text-stone-600 text-base sm:text-lg font-medium leading-relaxed">
              {activeMode === 'card'
                ? 'Concise takeaways, core principles & chemical formulas'
                : activeMode === 'mindmap'
                ? 'Explore concepts, branch connections, and click nodes to expand relationships'
                : (activeOption?.description || 'Interactive practice to strengthen your understanding.')}
            </p>
          </div>

          {/* Dedicated Renderer for the Chosen Option */}
          <div className="w-full">
            {loading || !conceptData ? (
              mediaNotReady || !loading ? (
                <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center max-w-xl mx-auto">
                  <div className="w-10 h-10 mx-auto rounded-full border-2 border-stone-300 border-t-[#6d0e00] animate-spin" />
                  <h3 className="mt-4 text-base font-bold text-stone-900">Your {activeMode === 'quiz' ? 'quiz' : activeMode === 'listen' ? 'audio' : activeMode === 'card' ? 'concept card' : 'mind map'} is getting ready — about 5 minutes left</h3>
                  <p className="mt-1 text-xs text-stone-500">You can wait here or come back in a bit.</p>
                  <button type="button" onClick={() => window.location.reload()} className="mt-4 px-5 py-2 rounded-full border-2 border-[#6d0e00] text-[#6d0e00] text-xs font-bold hover:bg-[#6d0e00] hover:text-white transition-colors cursor-pointer">Check again</button>
                </div>
              ) : (
                <div className="h-64 bg-stone-200/50 rounded-3xl animate-pulse" />
              )
            ) : (
              <>
                {activeMode === 'listen' && <ListenRenderer conceptData={conceptData} />}
                {activeMode === 'card' && <ConceptCardRenderer conceptData={conceptData} />}
                {activeMode === 'mindmap' && <MindMapRenderer conceptData={conceptData} />}
                {activeMode === 'quiz' && <QuickQuizRenderer conceptData={conceptData} />}
              </>
            )}
          </div>
        </main>
      )}
    </div>
  );
}

/**
 * 1. LISTEN RENDERER
 * Open stage with full-width audio controls, floating artwork, and animated background water wave.
 */
function ListenRenderer({ conceptData }: { conceptData: GeneratedConceptData }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [duration, setDuration] = useState(conceptData.video.durationSeconds || 150);
  const totalDuration = duration || conceptData.video.durationSeconds || 150;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep element playback rate in sync with the speed button.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // The audio OF the video: prefer the dedicated audio track from R2, else
  // stream the audio track of the video mp4 itself (browsers play mp4 audio
  // through an <audio> element — no video is shown). Nothing is hardcoded.
  const audioSrc = conceptData.audioUrl || conceptData.videoUrl || null;

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const seekBy = (delta: number) => {
    const el = audioRef.current;
    if (el && audioSrc) {
      el.currentTime = Math.min(Math.max(0, el.currentTime + delta), totalDuration);
    } else {
      setCurrentTime((prev) => Math.min(Math.max(0, prev + delta), totalDuration));
    }
  };

  const seekTo = (value: number) => {
    const el = audioRef.current;
    if (el && audioSrc) {
      el.currentTime = value;
    }
    setCurrentTime(value);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="w-full relative flex flex-col justify-between min-h-[540px] sm:min-h-[580px] lg:min-h-[620px] pt-2 pb-6 px-0 overflow-visible">
      {/* The single audio element: plays the same audio the video used. */}
      {audioSrc ? (
        <audio
          ref={audioRef}
          preload="metadata"
          src={audioSrc}
          className="hidden"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setCurrentTime(el.currentTime);
            if (!el.paused) setIsPlaying(true);
          }}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            if (el.duration && Number.isFinite(el.duration)) setDuration(el.duration);
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onEnded={() => setIsPlaying(false)}
        />
      ) : (
        <div className="relative z-10 w-full mb-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-medium text-amber-800">
          Your audio is getting ready — about 5 minutes left. You can wait here or come back in a bit.
        </div>
      )}
      {conceptData.script.fullTranscript && (
        <details className="relative z-10 w-full mb-2 rounded-2xl bg-white/90 border border-stone-200 px-4 py-3 text-xs text-stone-600">
          <summary className="cursor-pointer font-bold text-stone-800">Read along (transcript)</summary>
          <p className="mt-1.5 leading-relaxed whitespace-pre-line">{conceptData.script.fullTranscript}</p>
        </details>
      )}
      {/* Purple & Blue Background Gradient with Grow/Ungrow Animation in open space - No container */}
      <GradientAudioBackground isPlaying={isPlaying} />

      {/* Center Stage: Image with ONLY slow up and down animation - No container */}
      <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center py-6 sm:py-10">
        {/* Audio Image: strictly slow up and down floating, no grow/ungrow scaling */}
        <motion.div
          animate={isPlaying ? { y: [0, -14, 0] } : { y: 0 }}
          transition={
            isPlaying
              ? {
                  duration: 3.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }
              : { duration: 0.4 }
          }
          className="flex items-center justify-center"
        >
          <img
            src="/audio.png"
            alt="Audio Activity"
            className="max-h-76 sm:max-h-88 md:max-h-[400px] lg:max-h-[460px] w-auto max-w-full object-contain drop-shadow-[0_12px_28px_rgba(99,102,241,0.22)] select-none scale-130 sm:scale-135 md:scale-140 transition-transform duration-300 pointer-events-none"
            onError={(e) => handleImageFallback(e)}
          />
        </motion.div>
      </div>

      {/* Bottom Audio Bar & Controls: Clean and directly on page, NOT in any container */}
      <div className="relative z-10 w-full space-y-3 pt-4">
        {/* Full-Width Scrub Slider with Red Covered Section */}
        <div className="w-full space-y-2">
          <div className="relative w-full flex items-center py-2">
            {/* Base Track */}
            <div className="w-full h-3 bg-stone-300/80 rounded-full overflow-hidden relative shadow-inner">
              {/* Red Covered Section */}
              <div
                className="h-full bg-[#c9381a] rounded-full transition-all duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Draggable & Clickable Native Scrubber */}
            <input
              type="range"
              min={0}
              max={totalDuration}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Seek audio"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />

            {/* Red Thumb Indicator */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4.5 h-4.5 bg-[#c9381a] rounded-full shadow-md border-2 border-white pointer-events-none transition-all duration-75 z-10"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* Timestamps */}
          <div className="flex justify-between items-center text-xs sm:text-sm font-mono font-semibold text-stone-700">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Audio Action Controls: Buttons Centered & Speed on the Extreme Right */}
        <div className="w-full relative flex items-center justify-center pt-1">
          {/* Centered Playback Controls */}
          <div className="flex items-center justify-center gap-6 sm:gap-8">
            <button
              type="button"
              onClick={() => seekBy(-10)}
              className="p-3 rounded-full text-stone-700 hover:text-stone-950 hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
              aria-label="Rewind 10s"
            >
              <RotateCcw size={22} className="stroke-[2.2]" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              disabled={!audioSrc}
              className="w-16 h-16 rounded-full bg-[#6d0e00] hover:bg-[#520a00] disabled:opacity-40 text-white flex items-center justify-center shadow-lg hover:shadow-xl active:scale-95 transition-all cursor-pointer"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={28} /> : <Play size={28} className="fill-white ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => seekBy(10)}
              className="p-3 rounded-full text-stone-700 hover:text-stone-950 hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
              aria-label="Forward 10s"
            >
              <RotateCw size={22} className="stroke-[2.2]" />
            </button>
          </div>

          {/* Playback Speed on the Extreme Right */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => {
                const speeds = [0.75, 1, 1.25, 1.5];
                const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                setPlaybackSpeed(next);
              }}
              className="px-3.5 py-1.5 rounded-full bg-white/90 hover:bg-white text-stone-800 font-bold text-xs sm:text-sm tracking-wide border border-stone-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-95"
              aria-label="Playback speed"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Clean Background Gradient with Grow/Ungrow Animation in Purple and Blue:
 * All extra rings, layers, and shapes removed from the container.
 * The purple-to-blue radial background gradient smoothly grows and un-grows during playback.
 */
function GradientAudioBackground({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden select-none z-0">
      {/* Animated Purple-to-Blue Background Gradient with smooth grow and ungrow */}
      <motion.div
        className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[min(94vw,800px)] sm:w-[880px] md:w-[1020px] h-[340px] sm:h-[420px] rounded-full blur-[65px] sm:blur-[85px] pointer-events-none"
        animate={
          isPlaying
            ? {
                scale: [1, 1.24, 1],
                opacity: [0.70, 0.95, 0.70],
              }
            : {
                scale: 1,
                opacity: 0.55,
              }
        }
        transition={
          isPlaying
            ? {
                duration: 3.4,
                repeat: Infinity,
                ease: 'easeInOut',
              }
            : { duration: 0.6 }
        }
        style={{
          background: 'radial-gradient(ellipse 75% 60% at 50% 50%, rgba(139, 92, 246, 0.65) 0%, rgba(99, 102, 241, 0.50) 40%, rgba(59, 130, 246, 0.38) 70%, transparent 95%)',
        }}
      />
    </div>
  );
}

interface ChemistryFlashcard {
  id: string;
  conceptTitle: string;
  hintQuestion: string;
  answerTitle: string;
  takeaway: string;
  formula: string;
  keyFact: string;
  solidBg: string; // purely solid colors matching the practice cards: listen blue, concept red, mindmap purple, quiz green, etc.
}

/**
 * 2. CONCEPT CARD RENDERER
 * Two-deck layout solving wide screen presentation:
 * - Left side: Stack of unrevealed cards showing questions & hints
 * - Right side: Initially empty; revealed cards flip over and stack here with answers & formulas
 * - Cards have SOLID colors (no gradients), matching the practice page cards
 * - Strictly NO numbers displayed anywhere
 */
function ConceptCardRenderer({ conceptData }: { conceptData: GeneratedConceptData }) {
  // Cards come ONLY from the backend (quiz pipeline per concept+language).
  // Nothing is hardcoded: with no backend cards yet we show a getting-ready
  // notice instead of another topic's content.
  const deck: ChemistryFlashcard[] = (conceptData.flashcards ?? [])
    .filter((f) => f.front || f.back)
    .map((f, i) => ({
      id: `backend-fc-${i}`,
      conceptTitle: conceptData.topicName || conceptData.conceptName,
      hintQuestion: f.front,
      answerTitle: conceptData.topicName || conceptData.conceptName,
      takeaway: f.back,
      formula: '',
      keyFact: conceptData.ncertCitation,
      solidBg: ['bg-[#254CE8]', 'bg-[#C9381A]', 'bg-[#5B34C8]', 'bg-[#0B7D58]'][i % 4],
    }));
  const [unrevealedIndex, setUnrevealedIndex] = useState(0);
  const [revealedCards, setRevealedCards] = useState<ChemistryFlashcard[]>([]);
  const [rightCardFlipped, setRightCardFlipped] = useState(false);
  const [flyingState, setFlyingState] = useState<{
    card: ChemistryFlashcard;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const [isReturningAll, setIsReturningAll] = useState(false);
  const [returnDelta, setReturnDelta] = useState<{ deltaX: number; deltaY: number }>({ deltaX: 0, deltaY: 0 });
  const [isAnimating, setIsAnimating] = useState(false);

  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  const leftStackRef = useRef<HTMLDivElement>(null);
  const rightStackRef = useRef<HTMLDivElement>(null);

  const currentLeftCard = unrevealedIndex < deck.length
    ? deck[unrevealedIndex]
    : null;

  const topRevealedCard = revealedCards.length > 0 ? revealedCards[0] : null;

  // Handle clicking the left card: flips and flies over to the right stack
  const handleLeftCardClick = () => {
    if (isAnimating || isReturningAll || !currentLeftCard) return;

    let deltaX = 0;
    let deltaY = 0;

    if (leftStackRef.current && rightStackRef.current) {
      const leftRect = leftStackRef.current.getBoundingClientRect();
      const rightRect = rightStackRef.current.getBoundingClientRect();
      deltaX = rightRect.left - leftRect.left;
      deltaY = rightRect.top - leftRect.top;
    }

    setIsAnimating(true);
    setRightCardFlipped(false);
    setFlyingState({
      card: currentLeftCard,
      deltaX,
      deltaY,
    });
    // Advance the unrevealed index so the next card in the stack appears underneath
    setUnrevealedIndex((prev) => prev + 1);
  };

  // Trigger all cards to flip and move from the right back to the left
  const triggerReturnAllToLeft = () => {
    if (isAnimating || isReturningAll) return;
    let deltaX = 0;
    let deltaY = 0;
    if (leftStackRef.current && rightStackRef.current) {
      const leftRect = leftStackRef.current.getBoundingClientRect();
      const rightRect = rightStackRef.current.getBoundingClientRect();
      deltaX = leftRect.left - rightRect.left;
      deltaY = leftRect.top - rightRect.top;
    }
    setReturnDelta({ deltaX, deltaY });
    setIsReturningAll(true);
    setIsAnimating(true);
  };

  // Handle clicking on the card on the right
  // Single click: flips the card on the right (toggles question/answer in place)
  // Double click (or 2 fast clicks) when all cards have travelled to the right: flips all cards and moves them back to the left
  const handleRightClick = () => {
    if (isAnimating || isReturningAll || !topRevealedCard) return;
    const allCardsOnRight = unrevealedIndex >= deck.length && revealedCards.length === deck.length;

    clickCountRef.current += 1;

    if (clickCountRef.current === 2 && allCardsOnRight) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickCountRef.current = 0;
      triggerReturnAllToLeft();
      return;
    }

    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      // Single click: flips back and stays on the right
      clickCountRef.current = 0;
      setRightCardFlipped((prev) => !prev);
    }, 250);
  };

  const handleRightDoubleClick = () => {
    const allCardsOnRight = unrevealedIndex >= deck.length && revealedCards.length === deck.length;
    if (allCardsOnRight && !isAnimating && !isReturningAll) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickCountRef.current = 0;
      triggerReturnAllToLeft();
    }
  };

  // After every hook: no backend cards yet (quiz pipeline still running) —
  // show getting-ready instead of another topic's hardcoded deck.
  if (deck.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center max-w-xl mx-auto">
        <div className="w-10 h-10 mx-auto rounded-full border-2 border-stone-300 border-t-[#6d0e00] animate-spin" />
        <h3 className="mt-4 text-base font-bold text-stone-900">Your concept cards are almost ready…</h3>
        <p className="mt-1 text-xs text-stone-500">We're putting them together. Give it a few seconds, then refresh.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 px-5 py-2 rounded-full border-2 border-[#6d0e00] text-[#6d0e00] text-xs font-bold hover:bg-[#6d0e00] hover:text-white transition-colors cursor-pointer">Check again</button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto py-2">
      {/* Two Column Deck Layout without any headers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        
        {/* ================= LEFT SIDE: Question Stack ================= */}
        <div ref={leftStackRef} className="relative w-full min-h-[430px] sm:min-h-[450px]">
          {/* Background stack card layers peeking behind */}
          {unrevealedIndex + 2 < deck.length && (
            <div 
              className="absolute inset-0 translate-y-4 scale-[0.93] rounded-3xl bg-stone-300/80 shadow-xs pointer-events-none -z-20 border border-stone-300"
            />
          )}
          {unrevealedIndex + 1 < deck.length && (
            <div 
              className="absolute inset-0 translate-y-2 scale-[0.965] rounded-3xl bg-stone-400/70 shadow-sm pointer-events-none -z-10 border border-stone-300/60"
            />
          )}

          {/* Active Card on Left */}
          {currentLeftCard ? (
            <motion.div
              whileHover={!isAnimating ? { y: -4 } : {}}
              whileTap={!isAnimating ? { scale: 0.985 } : {}}
              onClick={handleLeftCardClick}
              className={`w-full min-h-[430px] sm:min-h-[450px] rounded-3xl p-8 sm:p-12 relative flex flex-col justify-center overflow-hidden shadow-xl cursor-pointer select-none transition-shadow hover:shadow-2xl ${currentLeftCard.solidBg}`}
            >
              {/* Card Body: Concept Title & Question / Hint only */}
              <div className="space-y-5">
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight drop-shadow-xs">
                  {currentLeftCard.conceptTitle}
                </h3>
                <p className="text-white/95 text-base sm:text-lg md:text-xl font-medium leading-relaxed">
                  {currentLeftCard.hintQuestion}
                </p>
              </div>
            </motion.div>
          ) : (
            /* Left side dashed rounded container with congratulations text and pill start over button */
            <div className="w-full min-h-[430px] sm:min-h-[450px] rounded-3xl border-2 border-dashed border-stone-300 bg-stone-100/30 flex flex-col items-center justify-center p-6 sm:p-8 text-center space-y-4">
              <p className="text-sm sm:text-base font-medium text-stone-600 max-w-sm leading-relaxed">
                Congratulations, you have gone through all the cards. Would you like to start over?
              </p>
              <button
                type="button"
                onClick={triggerReturnAllToLeft}
                className="inline-flex items-center justify-center px-5 py-2 sm:px-6 sm:py-2 rounded-full border-2 border-[#6d0e00] text-[#6d0e00] bg-transparent hover:bg-[#6d0e00] hover:text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors duration-200 cursor-pointer select-none active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d0e00]/40"
              >
                Start Over
              </button>
            </div>
          )}

          {/* In-Flight Animating Card: Flips 180° and transfers to right side */}
          {flyingState && (
            <motion.div
              initial={{ x: 0, y: 0, rotateY: 0, scale: 1 }}
              animate={{
                x: flyingState.deltaX,
                y: flyingState.deltaY,
                rotateY: 180,
                scale: [1, 1.05, 1],
              }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => {
                setRevealedCards((prev) => [flyingState.card, ...prev]);
                setFlyingState(null);
                setIsAnimating(false);
              }}
              style={{ transformStyle: 'preserve-3d', perspective: '1400px' }}
              className="absolute inset-0 z-50 pointer-events-none"
            >
              {/* Front Side (Visible from 0° to 90°) */}
              <div
                className={`w-full h-full min-h-[430px] sm:min-h-[450px] rounded-3xl p-8 sm:p-12 relative flex flex-col justify-center overflow-hidden shadow-2xl ${flyingState.card.solidBg}`}
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="space-y-5">
                  <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                    {flyingState.card.conceptTitle}
                  </h3>
                  <p className="text-white/95 text-base sm:text-lg font-medium leading-relaxed">
                    {flyingState.card.hintQuestion}
                  </p>
                </div>
              </div>

              {/* Back Side (Visible from 90° to 180°) */}
              <div
                className={`w-full h-full min-h-[430px] sm:min-h-[450px] rounded-3xl p-8 sm:p-12 absolute inset-0 flex flex-col justify-center overflow-hidden shadow-2xl ${flyingState.card.solidBg}`}
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <div className="space-y-5">
                  <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {flyingState.card.answerTitle}
                  </h3>

                  <p className="text-white/95 text-sm sm:text-base leading-relaxed font-normal">
                    {flyingState.card.takeaway}
                  </p>

                  <div className="p-4 sm:p-5 rounded-2xl bg-black/25 border border-white/20 text-white space-y-2">
                    <div className="text-xs font-bold tracking-wider uppercase text-white/85">
                      Chemical Formula / Equation
                    </div>
                    <div className="font-mono font-bold text-sm sm:text-base md:text-lg text-white tracking-wide overflow-x-auto py-0.5">
                      {flyingState.card.formula}
                    </div>
                    <div className="text-xs text-white/80 font-medium">
                      {flyingState.card.keyFact}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ================= RIGHT SIDE: Answer Deck ================= */}
        <div ref={rightStackRef} className="relative w-full min-h-[430px] sm:min-h-[450px]">
          {topRevealedCard ? (
            <div className="relative w-full min-h-[430px] sm:min-h-[450px]">
              {/* Visual stack layers behind the top revealed card */}
              {revealedCards.length > 2 && (
                <div className="absolute inset-0 translate-y-4 scale-[0.93] rounded-3xl bg-stone-300/80 shadow-xs pointer-events-none -z-20 border border-stone-300" />
              )}
              {revealedCards.length > 1 && (
                <div className="absolute inset-0 translate-y-2 scale-[0.965] rounded-3xl bg-stone-400/70 shadow-sm pointer-events-none -z-10 border border-stone-300/60" />
              )}

              {/* Top Card on Right with in-place 3D flip on single click */}
              <div 
                className="w-full min-h-[430px] sm:min-h-[450px] cursor-pointer"
                style={{ perspective: '1400px' }}
                onClick={handleRightClick}
                onDoubleClick={handleRightDoubleClick}
              >
                <motion.div
                  className="w-full h-full relative"
                  initial={false}
                  animate={{ rotateY: rightCardFlipped ? 180 : 0 }}
                  transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  {/* Face 1 (Answer & Formula - default on right side) */}
                  <div
                    className={`w-full min-h-[430px] sm:min-h-[450px] rounded-3xl p-8 sm:p-12 relative flex flex-col justify-center overflow-hidden shadow-xl select-none ${topRevealedCard.solidBg}`}
                    style={{ backfaceVisibility: 'hidden' }}
                  >
                    <div className="space-y-5">
                      <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                        {topRevealedCard.answerTitle}
                      </h3>

                      <p className="text-white/95 text-sm sm:text-base leading-relaxed font-normal">
                        {topRevealedCard.takeaway}
                      </p>

                      <div className="p-4 sm:p-5 rounded-2xl bg-black/25 border border-white/20 text-white space-y-2">
                        <div className="text-xs font-bold tracking-wider uppercase text-white/85">
                          Chemical Formula / Equation
                        </div>
                        <div className="font-mono font-bold text-sm sm:text-base md:text-lg text-white tracking-wide overflow-x-auto py-0.5">
                          {topRevealedCard.formula}
                        </div>
                        <div className="text-xs text-white/80 font-medium">
                          {topRevealedCard.keyFact}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Face 2 (Flips back to Question / Hint on right side) */}
                  <div
                    className={`w-full min-h-[430px] sm:min-h-[450px] rounded-3xl p-8 sm:p-12 absolute inset-0 flex flex-col justify-center overflow-hidden shadow-xl select-none ${topRevealedCard.solidBg}`}
                    style={{
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                    }}
                  >
                    <div className="space-y-5">
                      <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                        {topRevealedCard.conceptTitle}
                      </h3>
                      <p className="text-white/95 text-base sm:text-lg md:text-xl font-medium leading-relaxed">
                        {topRevealedCard.hintQuestion}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Returning All Cards to Left Animation */}
              {isReturningAll && (
                <motion.div
                  initial={{ x: 0, y: 0, rotateY: 180, scale: 1 }}
                  animate={{
                    x: returnDelta.deltaX,
                    y: returnDelta.deltaY,
                    rotateY: 0,
                    scale: [1, 1.05, 1],
                  }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  onAnimationComplete={() => {
                    setUnrevealedIndex(0);
                    setRevealedCards([]);
                    setRightCardFlipped(false);
                    setIsReturningAll(false);
                    setIsAnimating(false);
                  }}
                  style={{ transformStyle: 'preserve-3d', perspective: '1400px' }}
                  className="absolute inset-0 z-50 pointer-events-none"
                >
                  <div
                    className={`w-full h-full min-h-[430px] sm:min-h-[450px] rounded-3xl p-8 sm:p-12 relative flex flex-col justify-center overflow-hidden shadow-2xl ${topRevealedCard.solidBg}`}
                  >
                    <div className="space-y-5">
                      <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                        {deck[0].conceptTitle}
                      </h3>
                      <p className="text-white/95 text-base sm:text-lg font-medium leading-relaxed">
                        {deck[0].hintQuestion}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            /* Right side initially empty: simple line prompting the user */
            <div className="w-full min-h-[430px] sm:min-h-[450px] rounded-3xl border-2 border-dashed border-stone-300 bg-stone-100/30 flex items-center justify-center p-6 text-center">
              <p className="text-sm font-medium text-stone-500 tracking-wide select-none">
                Flip the cards on the left to reveal the answer.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/**
 * 3. MIND MAP RENDERER
 * ClickUp-style infinite canvas mind map.
 * Supports:
 * - Free panning (drag / scroll up, down, left, right)
 * - Zoom in / out controls & reset view
 * - ClickUp-style cards with colored line connectors and +/- expand toggle buttons
 * - Clicking a node reveals / toggles its connected child nodes
 * - Clean visual hierarchy with NO unwanted illustrations
 */
interface MindMapNode {
  id: string;
  label: string;
  color: string;
  iconType?: 'bullet' | 'square' | 'circle';
  parentId?: string;
  level: number; // 0 = root, 1 = branch, 2 = leaf
  x: number;
  y: number;
  width: number;
  height: number;
  childrenIds?: string[];
  description?: string;
}

function MindMapRenderer({ conceptData }: { conceptData: GeneratedConceptData }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Map nodes hierarchy - aligned with the curriculum (Chemical Equations & Balancing)
  // Two main primary branches connected directly to the root for clear two-node middle focus:
  // Root -> 'branch-foundations' & 'branch-methods'
  // When Root expands, root stays stable and the primary nodes appear to the right!
  // Expanding branches reveals further horizontal sub-branches and leaves in a fixed, clear layout.
  // Graph is built from the BACKEND scene_graph (already in the student's
  // language) — nothing is hardcoded. Unreachable nodes attach to the root so
  // no generated content is ever lost.
  const graph: Record<string, MindMapNode> = useMemo(() => {
    const scene = conceptData.sceneGraph;
    const out: Record<string, MindMapNode> = {};
    if (!scene || !scene.nodes || scene.nodes.length === 0) return out;

    const TYPE_COLORS: Record<string, string> = {
      prerequisite: '#ec4899',
      core: '#6366f1',
      application: '#3b82f6',
      extension: '#10b981',
    };
    const childrenOf = new Map<string, string[]>();
    const incoming = new Map<string, number>();
    for (const n of scene.nodes) incoming.set(n.id, 0);
    for (const e of scene.edges ?? []) {
      if (!incoming.has(e.from) || !incoming.has(e.to)) continue;
      if (e.from === e.to) continue;
      const list = childrenOf.get(e.from) ?? [];
      if (!list.includes(e.to)) list.push(e.to);
      childrenOf.set(e.from, list);
      incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    }

    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    let rootId = scene.nodes.find((n) => (incoming.get(n.id) ?? 0) === 0)?.id;
    if (!rootId || !byId.has(rootId)) {
      rootId =
        scene.nodes.find((n) => n.type === 'core')?.id ??
        scene.nodes.find((n) => n.type === 'prerequisite')?.id ??
        scene.nodes[0].id;
    }

    // BFS depths from the root; unreachable nodes hang off the root.
    const depth = new Map<string, number>([[rootId, 0]]);
    const queue: string[] = [rootId];
    const seen = new Set(queue);
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const child of childrenOf.get(cur) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        depth.set(child, (depth.get(cur) ?? 0) + 1);
        queue.push(child);
      }
    }
    for (const n of scene.nodes) {
      if (!depth.has(n.id)) {
        depth.set(n.id, 1);
        const list = childrenOf.get(rootId) ?? [];
        if (!list.includes(n.id)) list.push(n.id);
        childrenOf.set(rootId, list);
      }
    }

    const depthIndex = new Map<number, number>();
    const ordered = [...scene.nodes].sort(
      (a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0)
    );
    for (const n of ordered) {
      const d = depth.get(n.id) ?? 0;
      const idx = depthIndex.get(d) ?? 0;
      depthIndex.set(d, idx + 1);
      const label = n.label || 'Concept';
      out[n.id] = {
        id: n.id,
        label,
        color: TYPE_COLORS[(n.type || '').toLowerCase()] ?? '#8b5cf6',
        iconType: d === 0 ? 'circle' : d === 1 ? 'bullet' : 'square',
        parentId: undefined,
        level: d,
        x: 60 + d * 360,
        y: 40 + idx * 84,
        width: Math.min(320, Math.max(210, label.length * 7 + 84)),
        height: 52,
        childrenIds: childrenOf.get(n.id) ?? [],
        description: n.description || '',
      };
    }
    // Parent links (skip the synthetic root attachments' cycles safely).
    for (const [parent, kids] of childrenOf) {
      for (const kid of kids) {
        if (out[kid] && kid !== rootId && !out[kid].parentId) out[kid].parentId = parent;
      }
    }
    return out;
  }, [conceptData]);

  const defaultNodes = graph;

  // All nodes closed by default (empty set)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  // Store the most recent action to scroll the canvas viewport appropriately
  const [lastAction, setLastAction] = useState<{
    type: 'expand' | 'collapse';
    nodeId: string;
  } | null>(null);

  // Track if root is expanded
  const isRootExpanded = expandedNodeIds.has('root');

  // Toggle expand/collapse of a node
  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        setLastAction({ type: 'collapse', nodeId });
      } else {
        next.add(nodeId);
        setLastAction({ type: 'expand', nodeId });
      }
      return next;
    });
  };

  // Check if a node is visible based on parent expansion
  const isNodeVisible = (node: MindMapNode): boolean => {
    if (node.level === 0) return true;
    if (!node.parentId) return true;
    const parent = defaultNodes[node.parentId];
    if (!parent) return false;
    return expandedNodeIds.has(parent.id) && isNodeVisible(parent);
  };

  // Compute curved bezier path between parent's right toggle and child's left edge
  const getCurvePath = (startX: number, startY: number, endX: number, endY: number) => {
    const dx = Math.max(30, (endX - startX) * 0.5);
    const cp1x = startX + dx;
    const cp1y = startY;
    const cp2x = endX - dx;
    const cp2y = endY;
    return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
  };

  // Stable node positions - node coordinates and connections NEVER move backwards!
  // The layout stays fixed, while navigating backwards/forwards scrolls the canvas.
  const getNodePosition = (node: MindMapNode) => {
    return {
      x: node.x,
      y: node.y,
    };
  };

  // Dynamically compute canvas width and height based on visible nodes
  const visibleNodes = Object.values(defaultNodes).filter(isNodeVisible);
  const maxNodeRight = Math.max(
    ...visibleNodes.map((n) => {
      const pos = getNodePosition(n);
      return pos.x + n.width + 80;
    }),
    860
  );
  const maxNodeBottom = Math.max(
    ...visibleNodes.map((n) => {
      const pos = getNodePosition(n);
      return pos.y + n.height + 60;
    }),
    540
  );
  const canvasWidth = Math.max(maxNodeRight + 80, 920);
  const canvasHeight = Math.max(maxNodeBottom + 80, 560);

  // Smoothly scroll the canvas container backwards or forwards
  useEffect(() => {
    if (!lastAction || !containerRef.current) return;
    const container = containerRef.current;
    const node = defaultNodes[lastAction.nodeId];
    if (!node) return;

    if (lastAction.type === 'expand') {
      // Find the first child of this opened node to bring into view
      const firstChildId = node.childrenIds?.[0];
      const firstChild = firstChildId ? defaultNodes[firstChildId] : null;

      if (firstChild) {
        const childRight = firstChild.x + firstChild.width + 60;
        const currentViewRight = container.scrollLeft + container.clientWidth;

        // If the child extends beyond the viewport, scroll forward smoothly
        if (childRight > currentViewRight || firstChild.x < container.scrollLeft) {
          const targetScrollLeft = Math.max(0, firstChild.x - container.clientWidth + firstChild.width + 120);
          const targetScrollTop = Math.max(0, firstChild.y - container.clientHeight / 2 + firstChild.height / 2);

          container.scrollTo({
            left: targetScrollLeft,
            top: targetScrollTop,
            behavior: 'smooth',
          });
        }
      }
    } else if (lastAction.type === 'collapse') {
      // User moved backwards: scroll the canvas container backwards towards the parent/current node
      const parentNode = node.parentId ? defaultNodes[node.parentId] : null;
      const focusNode = parentNode || node;

      const targetScrollLeft = Math.max(0, focusNode.x - 80);
      const targetScrollTop = Math.max(0, focusNode.y - container.clientHeight / 2 + focusNode.height / 2);

      container.scrollTo({
        left: targetScrollLeft,
        top: targetScrollTop,
        behavior: 'smooth',
      });
    }
  }, [lastAction]);

  // Generate rendered edges
  const visibleEdges: Array<{
    id: string;
    path: string;
    color: string;
  }> = [];

  visibleNodes.forEach((childNode) => {
    if (childNode.level === 0 || !childNode.parentId) return;

    const parentNode = defaultNodes[childNode.parentId];
    if (!parentNode) return;

    const parentPos = getNodePosition(parentNode);
    const childPos = getNodePosition(childNode);

    // Toggle point is on parent right edge (+10 for the circular toggle badge)
    const startX = parentPos.x + parentNode.width + 10;
    const startY = parentPos.y + parentNode.height / 2;

    // End point is on child left edge
    const endX = childPos.x;
    const endY = childPos.y + childNode.height / 2;

    visibleEdges.push({
      id: `${parentNode.id}-${childNode.id}`,
      path: getCurvePath(startX, startY, endX, endY),
      color: childNode.color || parentNode.color,
    });
  });

  // After every hook: with no backend scene graph yet there is nothing true
  // to draw — show getting-ready instead of a wrong-language placeholder map.
  if (Object.keys(graph).length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center max-w-xl mx-auto">
        <div className="w-10 h-10 mx-auto rounded-full border-2 border-stone-300 border-t-[#6d0e00] animate-spin" />
        <h3 className="mt-4 text-base font-bold text-stone-900">Your mind map is almost ready…</h3>
        <p className="mt-1 text-xs text-stone-500">We're putting it together. Give it a few seconds, then refresh.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 px-5 py-2 rounded-full border-2 border-[#6d0e00] text-[#6d0e00] text-xs font-bold hover:bg-[#6d0e00] hover:text-white transition-colors cursor-pointer">Check again</button>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#F6F4F0] rounded-3xl border border-stone-200/80 shadow-xs overflow-hidden flex flex-col">
      {/* Mindmap Sub-Header */}
      <div className="px-6 py-3.5 border-b border-stone-200/70 flex items-center justify-between bg-[#F6F4F0] select-none">
        <span className="text-stone-700 text-xs sm:text-sm font-medium">
          Click on a node to expand or collapse
        </span>
      </div>
      {conceptData.sceneGraph && conceptData.sceneGraph.nodes.length > 0 ? (
        <div className="px-6 py-3 border-b border-stone-200/70 bg-white/70">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">Live concept map ({conceptData.sceneGraph.nodes.length} nodes)</div>
          <div className="flex flex-wrap gap-1.5">
            {conceptData.sceneGraph.nodes.slice(0, 12).map((n) => (
              <span key={n.id} title={n.description} className="text-[11px] font-medium text-stone-700 bg-stone-100 border border-stone-200 rounded-full px-2.5 py-1">{n.label}</span>
            ))}
          </div>
        </div>
      ) : conceptData.quizStatus === 'generating' ? (
        <div className="px-6 py-3 border-b border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-800">Your mind map is almost ready — showing a preview for now.</div>
      ) : null}

      {/* Natural Scrollable Canvas Container matching website background */}
      <div
        ref={containerRef}
        className="w-full min-h-[480px] max-h-[720px] overflow-auto bg-[#F6F4F0] p-6 sm:p-10"
        style={{
          backgroundImage: 'radial-gradient(#d6d3d1 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            position: 'relative',
          }}
          className="transition-all duration-500 ease-out"
        >
          {/* SVG Connection Lines */}
          <svg
            className="absolute inset-0 pointer-events-none w-full h-full overflow-visible"
            style={{ zIndex: 1 }}
          >
            {visibleEdges.map((edge) => (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke={edge.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                className="transition-all duration-500 ease-out"
              />
            ))}
          </svg>

          {/* Render Nodes */}
          {visibleNodes.map((node) => {
            const hasChildren = Boolean(node.childrenIds && node.childrenIds.length > 0);
            const isExpanded = expandedNodeIds.has(node.id);
            const pos = getNodePosition(node);

            return (
              <div
                key={node.id}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  minWidth: `${node.width}px`,
                  maxWidth: node.level === 0 ? '380px' : '320px',
                  zIndex: node.level === 0 ? 10 : 5,
                }}
                className={`absolute flex items-center transition-all duration-500 ease-out ${
                  !isRootExpanded && node.level === 0
                    ? 'scale-105'
                    : 'scale-100'
                }`}
              >
                {/* Node Box (White card with clean shadows, wraps text naturally so words are never cut off) */}
                <div
                  data-node-interactive="true"
                  onClick={() => {
                    if (hasChildren) {
                      toggleNodeExpansion(node.id);
                    }
                  }}
                  className={`w-full min-h-[50px] bg-white rounded-2xl shadow-sm border border-stone-200/90 py-3 px-4 flex items-center gap-3 transition-all select-none hover:shadow-md hover:border-stone-300 ${
                    hasChildren ? 'cursor-pointer hover:bg-stone-50/90 active:scale-[0.99]' : 'cursor-default'
                  } ${node.level === 0 ? 'ring-2 ring-indigo-500/10' : ''}`}
                  title={node.description}
                >
                  {/* Left Icon */}
                  {node.level === 0 ? (
                    <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                      <div className="w-4 h-4 rounded-full border-2 border-[#6366f1] flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" />
                      </div>
                    </div>
                  ) : node.iconType === 'bullet' ? (
                    <div className="flex flex-col gap-0.5 shrink-0 opacity-40">
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-stone-500" />
                        <div className="w-2.5 h-0.5 bg-stone-500 rounded-xs" />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-stone-500" />
                        <div className="w-2.5 h-0.5 bg-stone-500 rounded-xs" />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-stone-500" />
                        <div className="w-2.5 h-0.5 bg-stone-500 rounded-xs" />
                      </div>
                    </div>
                  ) : (
                    <div
                      className="w-3.5 h-3.5 rounded-xs shrink-0"
                      style={{ backgroundColor: node.color }}
                    />
                  )}

                  {/* Node Text Label: allows natural multi-line wrapping so words are NEVER cut off */}
                  <span className={`text-xs sm:text-sm font-semibold text-stone-800 tracking-tight leading-snug break-words ${node.level === 0 ? 'text-sm sm:text-base font-bold text-stone-900' : ''}`}>
                    {node.label}
                  </span>
                </div>

                {/* (+) / (-) Expand/Collapse Toggle Node Button */}
                {hasChildren && (
                  <button
                    data-node-interactive="true"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNodeExpansion(node.id);
                    }}
                    title={isExpanded ? 'Collapse connected nodes' : 'Expand connected nodes'}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-2 flex items-center justify-center shadow-xs transition-transform active:scale-90 hover:scale-110 cursor-pointer z-20"
                    style={{ borderColor: node.color, color: node.color }}
                  >
                    {isExpanded ? (
                      <Minus size={12} strokeWidth={3} />
                    ) : (
                      <Plus size={12} strokeWidth={3} />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 10 Curated NCERT Chemistry Questions for Quiz
const TEN_DEFAULT_CHEMISTRY_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q-01',
    question: 'Which fundamental scientific law mandates that chemical equations must be balanced?',
    options: [
      'Law of Definite Proportions',
      'Law of Conservation of Mass',
      "Avogadro's Law",
      "Boyle's Law",
    ],
    correctIndex: 1,
    concept: 'Law of Conservation of Mass',
    explanation:
      'According to the Law of Conservation of Mass, the total mass and atom counts of each element remain unchanged throughout a reaction.',
  },
  {
    id: 'q-02',
    question: 'When balancing an equation, which part of a chemical formula is strictly forbidden to alter?',
    options: [
      'The front stoichiometric coefficient',
      'The physical state symbol (e.g. (s), (l), (g))',
      'The subscript inside the formula (e.g. the 2 in H₂O)',
      'The order in which reactants are written',
    ],
    correctIndex: 2,
    concept: 'Chemical Subscripts & Formula Identity',
    explanation:
      'Subscripts define the chemical identity of the compound. Changing subscripts alters the actual substance rather than balancing the equation.',
  },
  {
    id: 'q-03',
    question: 'What is the balanced stoichiometric coefficient of O₂ in: 2Mg + O₂ → 2MgO?',
    options: ['1', '2', '3', '4'],
    correctIndex: 0,
    concept: 'Stoichiometric Coefficients',
    explanation:
      'Reactant side has 1 molecule of O₂ (giving 2 oxygen atoms), which balances the 2 oxygen atoms in 2MgO.',
  },
  {
    id: 'q-04',
    question: 'What is the first recommended step in the systematic balancing method?',
    options: [
      'Draw boxes around formulas and leave interior formulas untouched',
      'Multiply all numbers by 2 immediately',
      'Remove state symbols to simplify calculation',
      'Balance hydrogen atoms first before any other element',
    ],
    correctIndex: 0,
    concept: 'Box Method for Equation Balancing',
    explanation:
      'Drawing boxes around formulas ensures you never accidentally alter subscripts inside molecular formulas.',
  },
  {
    id: 'q-05',
    question: 'In the balanced reaction: 3Fe + 4H₂O → Fe₃O₄ + xH₂, what is the coefficient x?',
    options: ['2', '3', '4', '8'],
    correctIndex: 2,
    concept: 'Balancing Hydrogen & Oxygen Atoms',
    explanation:
      '4 molecules of H₂O supply 8 hydrogen atoms. To balance 8 hydrogen atoms on the product side, x must be 4.',
  },
  {
    id: 'q-06',
    question: 'What does the state symbol (aq) written after a chemical formula represent?',
    options: [
      'The substance is dissolved in water as a solution',
      'The substance is a pure liquid',
      'The reaction occurs at atmospheric pressure',
      'The substance is an insoluble precipitate',
    ],
    correctIndex: 0,
    concept: 'Aqueous (aq) & Physical State Symbols',
    explanation:
      'The designation (aq) denotes aqueous, meaning the reactant or product is present as a solution in water.',
  },
  {
    id: 'q-07',
    question: 'Which reaction type is represented by: CaO(s) + H₂O(l) → Ca(OH)₂(aq) + Heat?',
    options: [
      'Decomposition reaction',
      'Combination reaction',
      'Displacement reaction',
      'Double displacement reaction',
    ],
    correctIndex: 1,
    concept: 'Combination & Exothermic Reactions',
    explanation:
      'Quicklime and water combine to form a single product, slaked lime, which characterizes a combination reaction.',
  },
  {
    id: 'q-08',
    question: 'During thermal decomposition of lead nitrate [2Pb(NO₃)₂], what brown fumes are released?',
    options: [
      'Nitrogen gas (N₂)',
      'Nitrogen dioxide (NO₂)',
      'Nitrous oxide (N₂O)',
      'Oxygen gas (O₂)',
    ],
    correctIndex: 1,
    concept: 'Thermal Decomposition Reactions',
    explanation:
      'Heating lead nitrate decomposes it into lead monoxide, oxygen gas, and brown nitrogen dioxide (NO₂) fumes.',
  },
  {
    id: 'q-09',
    question: 'When an iron nail is placed in blue copper sulphate solution, why does it turn light green?',
    options: [
      'Iron displaces copper, forming iron(II) sulphate (FeSO₄)',
      'Copper dissolves into a gas',
      'Iron rusts with water vapour only',
      'Copper sulphate precipitates as a white salt',
    ],
    correctIndex: 0,
    concept: 'Displacement Reactions & Reactivity',
    explanation:
      'Because iron is more reactive than copper, it displaces copper from copper sulphate solution to form green FeSO₄.',
  },
  {
    id: 'q-10',
    question: 'In the reaction CuO + H₂ → Cu + H₂O, which substance undergoes reduction?',
    options: [
      'Copper oxide (CuO)',
      'Hydrogen gas (H₂)',
      'Water (H₂O)',
      'Pure Copper (Cu)',
    ],
    correctIndex: 0,
    concept: 'Redox Reactions & Reduction',
    explanation:
      'Copper oxide (CuO) loses oxygen to become elemental copper (Cu); loss of oxygen is reduction.',
  },
];

const QUESTION_TIME_SECONDS = 15;
const EXPLANATION_DURATION_MS = 5000; // Keep explanation for 5 seconds

/**
 * 4. QUICK QUIZ RENDERER
 * 10 questions with auto-advance, per-question timer, and score at the end.
 */
function QuickQuizRenderer({ conceptData }: { conceptData: GeneratedConceptData }) {
  const questions =
    conceptData.quiz && conceptData.quiz.length > 0
      ? conceptData.quiz
      : TEN_DEFAULT_CHEMISTRY_QUESTIONS;
  const usingFallback = !(conceptData.quiz && conceptData.quiz.length > 0);
  const quizPending = conceptData.quizStatus === 'generating' && conceptData.quiz.length === 0;

  // Hooks must run unconditionally (before any early return) so a
  // generating→ready transition never breaks hook order.
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number | null>>({});
  const [isAnswered, setIsAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoNextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const quizContainerRef = useRef<HTMLDivElement | null>(null);
  const explanationRef = useRef<HTMLDivElement | null>(null);

  const pendingQuizNotice = (
    <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center max-w-xl mx-auto">
      <div className="w-10 h-10 mx-auto rounded-full border-2 border-stone-300 border-t-[#6d0e00] animate-spin" />
      <h3 className="mt-4 text-base font-bold text-stone-900">Your quiz is almost ready…</h3>
      <p className="mt-1 text-xs text-stone-500">We're putting your questions together. Give it a few seconds, then refresh.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 px-5 py-2 rounded-full border-2 border-[#6d0e00] text-[#6d0e00] text-xs font-bold hover:bg-[#6d0e00] hover:text-white transition-colors cursor-pointer">Check again</button>
    </div>
  );

  const currentQ = questions[currentIndex];
  const userChoice = selectedAnswers[currentIndex];

  const scrollToTopForNextQuestion = () => {
    if (quizContainerRef.current) {
      const yOffset = -80;
      const y = quizContainerRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const advanceToNext = () => {
    scrollToTopForNextQuestion();
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsQuizCompleted(true);
    }
  };

  const scheduleNextAdvance = () => {
    // Auto scroll down slightly to allow the user to easily read the explanation
    setTimeout(() => {
      if (explanationRef.current) {
        explanationRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        window.scrollBy({ top: 160, behavior: 'smooth' });
      }
    }, 150);

    // Keep explanation for 10 seconds, then auto scroll up to see next question
    autoNextTimeoutRef.current = setTimeout(() => {
      advanceToNext();
    }, EXPLANATION_DURATION_MS);
  };

  // Reset timer on question change (skipped while the quiz is still pending).
  useEffect(() => {
    if (quizPending || isQuizCompleted) return;

    setTimeLeft(QUESTION_TIME_SECONDS);
    setIsAnswered(false);

    if (timerRef.current) clearInterval(timerRef.current);
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    };
  }, [currentIndex, isQuizCompleted, quizPending]);

  const handleTimeExpired = () => {
    setIsAnswered(true);
    setSelectedAnswers((prev) => ({ ...prev, [currentIndex]: null }));
    scheduleNextAdvance();
  };

  const handleSelectOption = (index: number) => {
    if (isAnswered || isQuizCompleted) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setIsAnswered(true);
    setSelectedAnswers((prev) => ({ ...prev, [currentIndex]: index }));
    scheduleNextAdvance();
  };

  const handleRestartQuiz = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    setSelectedAnswers({});
    setCurrentIndex(0);
    setIsAnswered(false);
    setTimeLeft(QUESTION_TIME_SECONDS);
    setIsQuizCompleted(false);
    scrollToTopForNextQuestion();
  };

  const totalScore = Object.entries(selectedAnswers).filter(
    ([qIdx, choice]) => choice !== null && questions[Number(qIdx)].correctIndex === choice
  ).length;

  const optionLetters = ['A', 'B', 'C', 'D'];

  // Score stats for popup
  const percent = Math.round((totalScore / questions.length) * 100);
  const missedQuestions = questions.filter(
    (_, qIdx) =>
      selectedAnswers[qIdx] === null ||
      selectedAnswers[qIdx] === undefined ||
      selectedAnswers[qIdx] !== questions[qIdx].correctIndex
  );
  const missedConcepts = Array.from(
    new Set(
      missedQuestions.map(
        (q, idx) => q.concept || `Concept ${idx + 1}`
      )
    )
  );

  // Rendered after every hook so hook order never changes between the
  // pending and ready states.
  if (quizPending) return pendingQuizNotice;

  return (
    <div ref={quizContainerRef} className="w-full bg-white rounded-3xl p-6 sm:p-10 shadow-md space-y-6 relative">
      {/* Header with Question Counter & Timer (No separating lines, no background on question counter) */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
          Question {currentIndex + 1} of {questions.length}
          {usingFallback && <span className="ml-2 text-[11px] font-medium text-stone-500">(sample set)</span>}
        </span>

        {/* Timer Badge with #6d0e00 - Hidden during explanation time, NO clock illustration */}
        {!isAnswered && (
          <div className="px-3.5 py-1.5 rounded-full bg-[#6d0e00] text-white text-xs sm:text-sm font-bold shadow-xs">
            <span>{timeLeft}s</span>
          </div>
        )}
      </div>

      {/* Smooth Timer Progress Bar in #6d0e00 - Hidden during explanation time */}
      {!isAnswered && (
        <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#6d0e00] transition-all duration-1000 ease-linear rounded-full"
            style={{ width: `${(timeLeft / QUESTION_TIME_SECONDS) * 100}%` }}
          />
        </div>
      )}

      {/* Question Text */}
      <div className="space-y-5 pt-1">
        <p className="text-lg sm:text-xl md:text-2xl font-bold text-stone-900 leading-snug font-sans">
          {currentQ.question}
        </p>

        {/* Multiple Choice Options with Vibrant Theme Colors and Letter Badges */}
        <div className="space-y-3">
          {currentQ.options.map((opt, idx) => {
            const isChosen = userChoice === idx;
            const isCorrect = currentQ.correctIndex === idx;
            const letter = optionLetters[idx] || String(idx + 1);

            let containerStyle = 'bg-stone-50 hover:bg-[#0B7D58]/10 text-stone-800 cursor-pointer shadow-xs active:scale-[0.99]';
            let letterStyle = 'bg-stone-200/80 text-stone-700 font-bold group-hover:bg-[#0B7D58]/20 group-hover:text-[#0B7D58]';

            if (isAnswered) {
              if (isChosen && isCorrect) {
                // User picked correct
                containerStyle = 'bg-[#0B7D58] text-white shadow-md font-semibold cursor-default';
                letterStyle = 'bg-white/25 text-white font-bold';
              } else if (isChosen && !isCorrect) {
                // User picked wrong
                containerStyle = 'bg-[#C9381A] text-white shadow-md font-semibold cursor-default';
                letterStyle = 'bg-white/25 text-white font-bold';
              } else if (!isChosen && isCorrect) {
                // The correct answer when user picked wrong
                containerStyle = 'bg-[#0B7D58]/15 text-[#0B7D58] font-bold ring-2 ring-[#0B7D58] cursor-default';
                letterStyle = 'bg-[#0B7D58] text-white font-bold';
              } else {
                // Other options
                containerStyle = 'bg-stone-100/60 text-stone-400 opacity-40 cursor-default';
                letterStyle = 'bg-stone-200/50 text-stone-400 font-normal';
              }
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectOption(idx)}
                disabled={isAnswered}
                className={`group w-full p-4 sm:p-4.5 rounded-2xl text-left text-sm sm:text-base font-sans transition-all flex items-center justify-between gap-3.5 ${containerStyle}`}
              >
                <div className="flex items-center gap-3.5 flex-1">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs shrink-0 transition-colors ${letterStyle}`}>
                    {letter}
                  </span>
                  <span className="leading-snug">{opt}</span>
                </div>

                {isAnswered && isCorrect && (
                  <CheckCircle2 size={20} className={isChosen ? 'text-white shrink-0' : 'text-[#0B7D58] shrink-0'} />
                )}
                {isAnswered && isChosen && !isCorrect && (
                  <X size={20} className="text-white shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Immediate Explanation Feedback - Vibrant Colors, No Separator Line */}
        {isAnswered && (
          <motion.div
            ref={explanationRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-5 rounded-2xl text-sm leading-relaxed shadow-sm space-y-2.5 ${
              userChoice === currentQ.correctIndex
                ? 'bg-[#0B7D58] text-white'
                : 'bg-[#C9381A] text-white'
            }`}
          >
            <div className="font-bold flex items-center gap-2 text-base">
              {userChoice === currentQ.correctIndex ? (
                <>
                  <CheckCircle2 size={18} className="text-white" />
                  <span>Correct!</span>
                </>
              ) : (
                <>
                  <X size={18} className="text-white" />
                  <span>Incorrect</span>
                </>
              )}
            </div>

            <p className="text-white/95 text-xs sm:text-sm font-normal leading-relaxed">
              {currentQ.explanation}
            </p>
          </motion.div>
        )}
      </div>

      {/* Quiz Score Pop-up Modal */}
      <AnimatePresence>
        {isQuizCompleted && (
          <div 
            onClick={() => setIsQuizCompleted(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xs cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-5 border border-stone-100 cursor-default"
            >
              {/* Header Title */}
              <div className="space-y-1">
                <h3 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
                  Quiz Result
                </h3>
                <p className="text-stone-500 text-xs sm:text-sm">
                  Here is your final performance summary
                </p>
              </div>

              {/* Score Display as Normal Text (NO container / box) */}
              <div className="space-y-1 py-1">
                <div className="text-4xl sm:text-5xl font-black text-stone-900 tracking-tight">
                  {totalScore} <span className="text-xl text-stone-400 font-normal">/ {questions.length}</span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-[#6d0e00]">
                  {percent}% Score
                </div>
              </div>

              {/* Paragraph advising on concepts */}
              <div className="text-xs sm:text-sm text-stone-600 leading-relaxed px-1">
                {missedConcepts.length > 0 ? (
                  <p>
                    You must revisit <strong className="text-stone-900 font-semibold">{missedConcepts.slice(0, 3).join(', ')}{missedConcepts.length > 3 ? ` and ${missedConcepts.length - 3} more` : ''}</strong>. Reviewing these topics will help you better your conceptual understanding, address gaps in the fundamentals, and master chemical balancing with confidence.
                  </p>
                ) : (
                  <p>
                    You have mastered all the concepts tested in this quiz! Reviewing key equations and definitions periodically will help you retain this knowledge for exam day.
                  </p>
                )}
              </div>

              {/* Start Over Again Button inside the pop-up */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRestartQuiz}
                  className="inline-flex items-center justify-center px-6 py-2.5 sm:px-7 sm:py-2.5 rounded-full border-2 border-[#6d0e00] text-[#6d0e00] bg-transparent hover:bg-[#6d0e00] hover:text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors duration-200 cursor-pointer select-none active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d0e00]/40"
                >
                  Start Over
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
