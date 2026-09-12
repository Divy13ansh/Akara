import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import { 
  conceptMediaService, 
  GeneratedConceptData 
} from '../services/conceptMediaService';
import { authService, UserProfile } from '../services/api';
import { TeachingBlob, BlobState } from '../components/TeachingBlob';
import { DoodleBlobs } from '../components/DoodleBlobs';

export default function Explain() {
  const navigate = useNavigate();
  const { conceptId } = useParams<{ conceptId: string }>();
  const [searchParams] = useSearchParams();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [conceptData, setConceptData] = useState<GeneratedConceptData | null>(null);
  const [blobState, setBlobState] = useState<BlobState>('idle');

  const subjectId = searchParams.get('subject') || 'science';
  const chapterId = searchParams.get('chapter') || 'chemical-reactions';
  const langParam = searchParams.get('lang') || '';
  const hardcodedSpeech = "Hello I am Akara. What are you going to teach me today ?";

  const handleGoToPractice = () => {
    const targetConcept = conceptId || 'cr-02';
    const targetLang = langParam || user?.default_language || 'hi';
    navigate(`/practice/${targetConcept}?subject=${subjectId}&chapter=${chapterId}&lang=${targetLang}`);
  };

  const handleGoToLearn = () => {
    const targetConcept = conceptId || 'cr-02';
    const targetLang = langParam || user?.default_language || 'hi';
    navigate(`/learn/${targetConcept}?subject=${subjectId}&chapter=${chapterId}&lang=${targetLang}`);
  };

  // Load concept data
  useEffect(() => {
    // FRONTEND BACKEND HOOK (page-level):
    // This page consumes GET /api/users/me/profile and GET /api/concepts/:conceptId/media
    // so the teaching flow can load the concept bundle, language, and related metadata.
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);

    const targetConceptId = conceptId || 'cr-02';
    const targetLang = langParam || currentUser?.default_language || 'hi';

    async function load() {
      setLoading(true);
      try {
        const data = await conceptMediaService.getGeneratedConceptData(targetConceptId, targetLang);
        setConceptData(data);
      } catch (err) {
        console.error('Failed to load teach data:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [conceptId, langParam]);

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans text-stone-900 selection:bg-[#6d0e00]/15 selection:text-[#6d0e00]">
      {/* Top Navbar */}
      <AppNavbar user={user} />

      {/* Main Container */}
      <main className="flex-1 w-full px-8 md:px-12 py-5 sm:py-6 pb-10 sm:pb-12 flex flex-col justify-between">
        {/* Header Section: Topic name on top left (Outside of the rectangle stage) */}
        <div className="mb-3 sm:mb-5">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-1.5">
            Teach it: {conceptData?.topicName || conceptData?.conceptName || 'Explain Concept'}
          </h1>
          <p className="text-stone-600 text-base sm:text-lg font-medium leading-relaxed">
            Teach this concept in your own words to your companion.
          </p>
        </div>

        {/* Open stage for Akara companion and doodle speech bubbles (no bounding card/container) */}
        <div className="flex-1 w-full relative flex flex-col items-center justify-center py-2 sm:py-4 min-h-[380px] sm:min-h-[420px]">
          {/* Sketchy doodle speech bubbles brought closer around Akara */}
          <DoodleBlobs onKeywordClick={() => {
            if (blobState === 'idle') {
              setBlobState('user-speaking');
            }
          }} />

          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-16 relative z-10">
              <div className="w-16 h-16 rounded-full bg-stone-200 animate-pulse" />
              <div className="w-36 h-4 bg-stone-200 rounded animate-pulse" />
            </div>
          ) : (
            <div className="relative flex flex-col items-center justify-center z-10 w-full">
              {/* The Companion Blob */}
              <div className="cursor-pointer">
                <TeachingBlob 
                  size={320} 
                  interactive={true}
                  state={blobState}
                  onStateChange={setBlobState}
                  speechText={hardcodedSpeech}
                  onSpeechEnd={() => setBlobState('idle')}
                />
              </div>

              {/* Simple line below Akara */}
              <p className="text-sm font-medium text-stone-500 mt-4 tracking-wide text-center select-none">
                Tap Akara to start listening
              </p>
            </div>
          )}
        </div>

        {/* Bottom Actions Row: Learn on the extreme left, Practice on the extreme right */}
        <div className="w-full flex items-center justify-between -mt-2 sm:-mt-4 lg:-mt-6 pb-2 z-20">
          <button
            type="button"
            id="learn-cta-btn"
            onClick={handleGoToLearn}
            className="inline-flex items-center justify-center px-7 py-2.5 sm:px-8 sm:py-3 rounded-full border-2 border-[#6d0e00] text-[#6d0e00] bg-transparent hover:bg-[#6d0e00] hover:text-white font-semibold text-sm sm:text-base shadow-xs transition-colors duration-200 cursor-pointer select-none active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d0e00]/40"
          >
            Learn
          </button>

          <button
            type="button"
            id="practice-cta-btn"
            onClick={handleGoToPractice}
            className="inline-flex items-center justify-center px-7 py-2.5 sm:px-8 sm:py-3 rounded-full border-2 border-[#6d0e00] text-[#6d0e00] bg-transparent hover:bg-[#6d0e00] hover:text-white font-semibold text-sm sm:text-base shadow-xs transition-colors duration-200 cursor-pointer select-none active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d0e00]/40"
          >
            Practice
          </button>
        </div>
      </main>
    </div>
  );
}
