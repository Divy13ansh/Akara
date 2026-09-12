import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  Loader2,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { 
  GeneratedConceptData, 
  GenerationStatusResponse, 
  conceptMediaService 
} from '../services/conceptMediaService';

interface VideoPlayerProps {
  conceptData: GeneratedConceptData;
  statusInfo: GenerationStatusResponse;
  onStatusPromoted?: () => void;
  onContinueToExplain?: () => void;
}

// Reliable sample public video stream (MDN public CC0 video with open CORS and guaranteed 200)
const SAMPLE_VIDEO_SRC = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const SAMPLE_POSTER_SRC = 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80';

export function VideoPlayer({ 
  conceptData, 
  statusInfo, 
  onStatusPromoted,
  onContinueToExplain
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isVideoEnded, setIsVideoEnded] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Live generation pipeline state tracking
  const [liveProgress, setLiveProgress] = useState(statusInfo.progressPercent);
  const [liveStage, setLiveStage] = useState(statusInfo.currentStage || 'Initializing generation pipeline…');
  const [isReady, setIsReady] = useState(statusInfo.status === 'instant');

  // Handle generation states progression
  useEffect(() => {
    setIsReady(statusInfo.status === 'instant');
    setLiveProgress(statusInfo.progressPercent);
    setLiveStage(statusInfo.currentStage || '');

    if (statusInfo.status === 'finishing_dub') {
      const timer = setTimeout(() => {
        conceptMediaService.markGenerationReady(conceptData.conceptId, conceptData.language);
        setIsReady(true);
        if (onStatusPromoted) onStatusPromoted();
      }, 2400);
      return () => clearTimeout(timer);
    }

    if (statusInfo.status === 'generating_first_time') {
      const stages = [
        { pct: 25, label: 'Extracting NCERT curriculum formulas and rules…' },
        { pct: 50, label: 'Synthesizing verified pedagogical script…' },
        { pct: 75, label: 'Rendering visual scene graph & molecular animation…' },
        { pct: 92, label: 'Synthesizing localized regional audio track…' },
        { pct: 100, label: 'Finalizing explainer package…' },
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
        if (currentStep < stages.length) {
          setLiveProgress(stages[currentStep].pct);
          setLiveStage(stages[currentStep].label);
          currentStep++;
        } else {
          clearInterval(interval);
          conceptMediaService.markGenerationReady(conceptData.conceptId, conceptData.language);
          setIsReady(true);
          if (onStatusPromoted) onStatusPromoted();
        }
      }, 1200);

      return () => clearInterval(interval);
    }
  }, [statusInfo.status, conceptData.conceptId, conceptData.language]);

  // Handle video element time update & ended event
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setIsVideoEnded(true);
  };

  // Rewatch action
  const handleRewatch = () => {
    setIsVideoEnded(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Continue to explain action
  const handleContinue = () => {
    if (onContinueToExplain) {
      onContinueToExplain();
    }
  };

  // Auto-hide controls after inactivity while playing
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  };

  const handleTogglePlay = () => {
    if (!isReady) return;
    if (isVideoEnded) {
      handleRewatch();
      return;
    }
    if (videoRef.current) {
      if (videoRef.current.paused) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
            })
            .catch((err) => {
              console.warn('Playback error or browser autoplay policy, attempting muted playback:', err);
              if (videoRef.current) {
                videoRef.current.muted = true;
                setIsMuted(true);
                videoRef.current
                  .play()
                  .then(() => setIsPlaying(true))
                  .catch((e) => {
                    console.error('Video playback failed:', e);
                  });
              }
            });
        }
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds: number) => {
    const safeSecs = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(safeSecs / 60);
    const secs = safeSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const totalDuration = duration || conceptData.video.durationSeconds || 120;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full aspect-16/9 bg-stone-950 rounded-3xl overflow-hidden shadow-xl border border-stone-800 select-none group font-sans"
    >
      {/* 1. BACKEND STATE: GENERATING FOR THE FIRST TIME */}
      {!isReady && statusInfo.status === 'generating_first_time' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-stone-950/95 text-stone-100 z-30 font-sans">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-stone-800/80 border border-stone-700 flex items-center justify-center mx-auto shadow-inner">
              <Loader2 size={26} className="animate-spin text-stone-200" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-white font-sans">
                Buffering…
              </h3>
              <p className="text-stone-400 text-sm font-medium leading-relaxed">
                Preparing the video for playback.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. BACKEND STATE: FINISHING THE DUB */}
      {!isReady && statusInfo.status === 'finishing_dub' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-stone-950/90 text-stone-100 z-30 font-sans">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-stone-800/80 border border-stone-700 flex items-center justify-center mx-auto shadow-inner">
              <Loader2 size={26} className="animate-spin text-stone-200" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white tracking-tight font-sans">
                Buffering…
              </h3>
              <p className="text-stone-400 text-sm font-medium leading-relaxed">
                Finalizing the video for playback.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. HTML5 VIDEO ELEMENT */}
      <video
        ref={videoRef}
        src={SAMPLE_VIDEO_SRC}
        poster={SAMPLE_POSTER_SRC}
        preload="auto"
        playsInline
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleVideoEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={handleTogglePlay}
        className="w-full h-full object-cover cursor-pointer bg-black"
      >
        <source src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" type="video/mp4" />
        <source src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm" type="video/webm" />
      </video>

      {/* Center Play Overlay when paused and not ended - smaller icon, no rectangle, no hover animation */}
      <AnimatePresence>
        {!isPlaying && isReady && !isVideoEnded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleTogglePlay}
            className="absolute inset-0 flex items-center justify-center cursor-pointer z-20"
          >
            <div className="text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] flex items-center justify-center">
              <Play size={44} className="fill-white text-white ml-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. POPUP AFTER VIDEO ENDS: REWATCH OR CONTINUE TO TEACH IT */}
      <AnimatePresence>
        {isVideoEnded && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-xs pointer-events-auto font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-sm sm:max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 text-center font-sans"
            >
              <h3 className="text-xl sm:text-2xl font-bold text-[#1a1a1a] tracking-tight mb-2 font-sans">
                Finished Watching!
              </h3>
              <p className="text-stone-600 text-base sm:text-lg font-medium leading-relaxed mb-6 font-sans">
                Would you like to rewatch this video or continue to teach it to test your understanding?
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3 font-sans">
                {/* [ Rewatch ] Button - no icon */}
                <button
                  type="button"
                  onClick={handleRewatch}
                  className="w-full sm:flex-1 py-3 px-4 rounded-2xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-base font-medium flex items-center justify-center transition-all active:scale-[0.98] cursor-pointer font-sans"
                >
                  <span>Rewatch</span>
                </button>

                {/* [ Teach it ] Button - no icon */}
                <button
                  type="button"
                  onClick={handleContinue}
                  className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-[#6d0e00] hover:bg-[#540b00] text-white text-base font-medium flex items-center justify-center shadow-lg shadow-[#6d0e00]/20 transition-all active:scale-[0.98] cursor-pointer font-sans"
                >
                  <span>Teach it</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. MINIMAL VIDEO CHROME / CONTROLS BAR */}
      {isReady && !isVideoEnded && (
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 sm:p-5 pt-8 z-20 space-y-2.5 font-sans"
            >
              {/* Scrub Bar - Pure white progress dot with no hover animation */}
              <div className="relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={totalDuration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  aria-label="Seek video playback"
                  className="w-full h-1.5 bg-stone-700/80 rounded-lg appearance-none cursor-pointer accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-xs [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-none"
                />
              </div>

              {/* Controls Row: No hover animations on video controls */}
              <div className="flex items-center justify-between text-stone-200 text-base sm:text-lg font-medium leading-relaxed font-sans">
                <div className="flex items-center gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="p-1.5 text-stone-200"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} className="fill-current" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const newTime = Math.max(0, currentTime - 10);
                      setCurrentTime(newTime);
                      if (videoRef.current) videoRef.current.currentTime = newTime;
                    }}
                    className="p-1.5 text-stone-200"
                    aria-label="Rewind 10 seconds"
                  >
                    <RotateCcw size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextMuted = !isMuted;
                      setIsMuted(nextMuted);
                      if (videoRef.current) videoRef.current.muted = nextMuted;
                    }}
                    className="p-1.5 text-stone-200"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>

                  {/* Time Counter */}
                  <span className="text-xs sm:text-sm text-stone-300 font-medium">
                    {formatTime(currentTime)} / {formatTime(totalDuration)}
                  </span>
                </div>

                {/* Right Controls: Speed & Fullscreen (Skip to End removed) */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Speed Selector */}
                  <button
                    type="button"
                    onClick={() => {
                      const speeds = [1, 1.25, 1.5, 2];
                      const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                      const newSpeed = speeds[nextIndex];
                      setPlaybackSpeed(newSpeed);
                      if (videoRef.current) videoRef.current.playbackRate = newSpeed;
                    }}
                    className="px-2.5 py-1 rounded-lg bg-stone-800/80 text-stone-200 text-xs sm:text-sm font-medium tracking-normal"
                    aria-label="Change playback speed"
                  >
                    {playbackSpeed}x
                  </button>

                  {/* Fullscreen Button */}
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    className="p-1.5 text-stone-200"
                    aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
