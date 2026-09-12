import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import { VideoPlayer } from '../components/VideoPlayer';
import { DoubtsChat } from '../components/DoubtsChat';
import { 
  conceptMediaService, 
  GeneratedConceptData, 
  GenerationStatusResponse
} from '../services/conceptMediaService';
import { authService, UserProfile } from '../services/api';

export default function Learn() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [conceptData, setConceptData] = useState<GeneratedConceptData | null>(null);
  const [statusInfo, setStatusInfo] = useState<GenerationStatusResponse | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const langParam = searchParams.get('lang') || '';

  // Synchronize chat container height with video player height so it never expands
  useEffect(() => {
    if (!videoContainerRef.current) return;

    const updateHeight = () => {
      if (videoContainerRef.current) {
        const rect = videoContainerRef.current.getBoundingClientRect();
        if (rect.height > 0) {
          setVideoHeight(Math.round(rect.height));
        }
      }
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(videoContainerRef.current);
    window.addEventListener('resize', updateHeight);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [loading, conceptData]);

  // Load user & concept generation data
  useEffect(() => {
    // FRONTEND BACKEND HOOK (page-level):
    // This page consumes GET /api/users/me/profile, GET /api/concepts/:conceptId/generation-status?lang={language},
    // and GET /api/concepts/:conceptId/media during the Learn flow.
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);

    const targetConceptId = conceptId || 'cr-02';
    const targetLang = langParam || currentUser?.default_language || 'hi';

    async function load() {
      setLoading(true);
      try {
        const [data, status] = await Promise.all([
          conceptMediaService.getGeneratedConceptData(targetConceptId, targetLang),
          conceptMediaService.getGenerationStatus(targetConceptId, targetLang),
        ]);
        setConceptData(data);
        setStatusInfo(status);
      } catch (err) {
        console.error('Failed to load concept media data:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [conceptId, langParam]);

  // Navigate to dominant CTA: Explain it back
  const handleExplainItBack = () => {
    if (!conceptData) return;
    const query = new URLSearchParams({
      subject: conceptData.subjectId,
      chapter: conceptData.chapterId,
      lang: conceptData.language,
    }).toString();
    navigate(`/explain/${conceptData.conceptId}?${query}`);
  };

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans text-stone-900 selection:bg-[#6d0e00]/15 selection:text-[#6d0e00]">
      {/* Top Navbar */}
      <AppNavbar user={user} />

      {/* Main Container - same margin spacing as Home page */}
      <main className="flex-1 w-full px-8 md:px-12 py-6 sm:py-8 pb-24 md:pb-12">
        {/* Header Section: Topic name on top left with Tagline */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-2">
            {conceptData?.topicName || conceptData?.conceptName || 'Learn Concept'}
          </h1>
          <p className="text-stone-600 text-base sm:text-lg font-medium leading-relaxed">
            Watch the video explanation to master this concept.
          </p>
        </div>

        {/* Content Loading Skeleton or Video Canvas with Side Chat */}
        {loading || !conceptData || !statusInfo ? (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8 space-y-4">
              <div className="w-full aspect-16/9 bg-stone-200/50 rounded-3xl animate-pulse" />
              <div className="h-6 w-1/2 bg-stone-200/50 rounded-lg animate-pulse" />
            </div>
            <div className="lg:col-span-4 h-full min-h-[380px] bg-stone-200/40 rounded-3xl animate-pulse" />
          </div>
        ) : (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Video Player */}
            <div ref={videoContainerRef} className="lg:col-span-8 w-full flex flex-col justify-start">
              <VideoPlayer
                conceptData={conceptData}
                statusInfo={statusInfo}
                onStatusPromoted={() => {
                  setStatusInfo((prev) => prev ? { ...prev, status: 'instant', progressPercent: 100 } : null);
                }}
                onContinueToExplain={handleExplainItBack}
              />
            </div>

            {/* Right: AI Doubts Chat strictly fixed to video player height */}
            <div 
              className="lg:col-span-4 w-full flex flex-col min-h-0 h-[480px] lg:h-auto overflow-hidden"
              style={
                videoHeight
                  ? { height: `${videoHeight}px`, maxHeight: `${videoHeight}px` }
                  : undefined
              }
            >
              <DoubtsChat topicName={conceptData.topicName || conceptData.conceptName} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
