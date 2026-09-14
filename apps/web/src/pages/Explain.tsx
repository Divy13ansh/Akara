import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import {
  conceptMediaService,
  GeneratedConceptData,
  ExplanationEvaluationResult
} from '../services/conceptMediaService';
import { authService, UserProfile } from '../services/api';
import { parseError } from '../services/http';
import { VoiceMentorButton } from '../components/VoiceMentorButton';
import { TeachingBlob, BlobState } from '../components/TeachingBlob';
import { DoodleBlobs } from '../components/DoodleBlobs';

export default function Explain() {
  const navigate = useNavigate();
  const { conceptId } = useParams<{ conceptId: string }>();
  const [searchParams] = useSearchParams();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conceptData, setConceptData] = useState<GeneratedConceptData | null>(null);
  const [blobState, setBlobState] = useState<BlobState>('idle');
  const [answer, setAnswer] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<ExplanationEvaluationResult | null>(null);

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
    const targetConceptId = conceptId || 'cr-02';

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const profile = await authService.getProfile();
        setUser(profile);
        const data = await conceptMediaService.getGeneratedConceptData(targetConceptId, langParam || undefined);
        setConceptData(data);
      } catch (err) {
        setError(parseError(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [conceptId, langParam]);

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetConceptId = conceptId || conceptData?.conceptId;
    if (!targetConceptId || !answer.trim() || evaluating) return;
    setEvaluating(true);
    setResult(null);
    setError(null);
    try {
      const res = await conceptMediaService.evaluateExplanation(
        targetConceptId,
        answer.trim(),
        conceptData?.mentorPrompt?.scenario || 'mastery_confirmation',
        langParam || user?.default_language || 'hi'
      );
      setResult(res);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setEvaluating(false);
    }
  };

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
          {conceptData?.mentorPrompt?.questionText && (
            <p className="mt-2 text-sm text-stone-700 bg-white border border-stone-200 rounded-2xl px-4 py-2.5 max-w-2xl">
              <span className="font-bold text-[#6d0e00]">Mentor prompt: </span>{conceptData.mentorPrompt.questionText}
            </p>
          )}
          {conceptData && (
            <div className="mt-3">
              <VoiceMentorButton conceptId={conceptData.conceptId} language={langParam || user?.default_language || undefined} />
            </div>
          )}
          {error && (
            <div role="alert" className="mt-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 max-w-2xl">{error}</div>
          )}
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
        <div className="w-full max-w-3xl mx-auto mt-4 bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 shadow-xs">
          <form onSubmit={handleEvaluate} className="space-y-3">
            <label htmlFor="explain-answer" className="text-sm font-bold text-stone-900">Type your explanation (Feynman check)</label>
            <textarea
              id="explain-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              placeholder="Explain in your own words…"
              className="w-full text-sm border border-stone-300 rounded-2xl px-4 py-3 outline-none focus:border-[#6d0e00] focus:ring-1 focus:ring-[#6d0e00] bg-white"
            />
            <button type="submit" disabled={evaluating || !answer.trim()} className="px-6 py-2.5 rounded-full bg-[#6d0e00] hover:bg-[#540b00] disabled:opacity-40 text-white text-sm font-bold transition-all cursor-pointer">
              {evaluating ? 'Evaluating…' : 'Submit explanation'}
            </button>
          </form>
          {result && (
            <div className="mt-4 text-sm space-y-2">
              <div className={`font-bold ${result.isMastered ? 'text-emerald-800' : 'text-[#6d0e00]'}`}>{result.feedbackHeadline} — {result.scorePercent}%</div>
              <p className="text-stone-700">{result.mentorFeedbackText}</p>
              {result.pointsCovered.length > 0 && <p className="text-stone-600"><span className="font-bold">Covered: </span>{result.pointsCovered.join(' · ')}</p>}
              {result.pointsMissed.length > 0 && <p className="text-stone-600"><span className="font-bold">To revisit: </span>{result.pointsMissed.join(' · ')}</p>}
              {result.diagnosticResolved && <p className="text-emerald-800 font-medium">Misconception marked resolved.</p>}
            </div>
          )}
        </div>

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
