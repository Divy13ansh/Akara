import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import { VideoPlayer } from '../components/VideoPlayer';
import { DoubtsChat } from '../components/DoubtsChat';
import { conceptMediaService, GeneratedConceptData, GenerationStatusResponse } from '../services/conceptMediaService';
import { authService, UserProfile } from '../services/api';
import { parseError } from '../services/http';
import { VoiceMentorButton } from '../components/VoiceMentorButton';

export default function Learn() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Load user & concept generation data (lang omitted → backend profile default)
  useEffect(() => {
    const targetConceptId = conceptId || 'cr-02';

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const profile = await authService.getProfile();
        setUser(profile);
        const targetLang = langParam || profile.default_language || 'hi';
        const status = await conceptMediaService.getGenerationStatus(targetConceptId, langParam || undefined);
        setStatusInfo(status);
        if (status.status === 'locked') {
          setError('This concept is locked — master the previous concept first.');
          return;
        }
        try {
          const data = await conceptMediaService.getGeneratedConceptData(targetConceptId, langParam || undefined);
          data.subjectId = data.subjectId || searchParams.get('subject') || '';
          data.chapterId = data.chapterId || searchParams.get('chapter') || '';
          setConceptData(data);
        } catch (mediaErr) {
          const { ApiError } = await import('../services/http');
          if (mediaErr instanceof ApiError && mediaErr.status === 404) {
            setConceptData(null);
          } else {
            throw mediaErr;
          }
        }
        if (status.status === 'generating_first_time' || status.status === 'queued') {
          conceptMediaService.pollGenerationStatus(targetConceptId, langParam || undefined, (s) => {
            setStatusInfo(s);
            if (s.status === 'instant') {
              conceptMediaService.getGeneratedConceptData(targetConceptId, langParam || undefined)
                .then((d) => setConceptData(d))
                .catch(() => {});
            }
          }).catch(() => {});
        }
        void targetLang;
      } catch (err) {
        setError(parseError(err));
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
          {conceptData && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <VoiceMentorButton conceptId={conceptData.conceptId} language={conceptData.language} />
              {conceptData.quizStatus === 'generating' && (
                <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
                  Practice quiz still generating — check the Practice tab in ~10s
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="mb-6 text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 max-w-2xl">
            {error}
          </div>
        )}

        {/* Content Loading Skeleton or Video Canvas with Side Chat */}
        {loading || !statusInfo ? (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8 space-y-4">
              <div className="w-full aspect-16/9 bg-stone-200/50 rounded-3xl animate-pulse" />
              <div className="h-6 w-1/2 bg-stone-200/50 rounded-lg animate-pulse" />
            </div>
            <div className="lg:col-span-4 h-full min-h-[380px] bg-stone-200/40 rounded-3xl animate-pulse" />
          </div>
        ) : !conceptData ? (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8">
              <VideoPlayer
                conceptData={{
                  conceptId: conceptId || 'cr-02',
                  conceptName: 'Preparing your explainer…',
                  subjectId: searchParams.get('subject') || '',
                  subjectName: '',
                  chapterId: searchParams.get('chapter') || '',
                  chapterName: '',
                  topicName: '',
                  classNumber: 10,
                  ncertCitation: '',
                  language: statusInfo.language,
                  availableLanguages: statusInfo.availableLanguages,
                  video: { title: '', durationSeconds: 0, durationFormatted: '0:00', scenes: [] },
                  videoUrl: null,
                  audioUrl: null,
                  quizStatus: 'generating',
                  flashcards: [],
                  script: { fullTranscript: '', summaryBullets: [], keyDefinitions: [], ncertSummary: '' },
                  sceneGraph: null,
                  quiz: [],
                  mentorPrompt: null,
                }}
                statusInfo={statusInfo}
                onStatusPromoted={() => {
                  setStatusInfo((prev) => prev ? { ...prev, status: 'instant', progressPercent: 100 } : null);
                }}
                onContinueToExplain={handleExplainItBack}
              />
            </div>
            <div className="lg:col-span-4 w-full flex flex-col min-h-0 h-[480px] lg:h-auto overflow-hidden" style={videoHeight ? { height: `${videoHeight}px`, maxHeight: `${videoHeight}px` } : undefined}>
              <DoubtsChat topicName="this concept" conceptId={conceptId} language={statusInfo.language} />
            </div>
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
              <DoubtsChat topicName={conceptData.topicName || conceptData.conceptName} conceptId={conceptData.conceptId} language={conceptData.language} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
