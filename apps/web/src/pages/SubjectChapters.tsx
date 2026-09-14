import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import { authService, curriculumService, UserProfile, Chapter, Subject } from '../services/api';
import { BookOpen } from 'lucide-react';
import { getChapterImage, getChapterBgColor, handleImageFallback } from '../components/CardThemeUtils';

export default function SubjectChapters() {
  const { subject: subjectParam } = useParams<{ subject: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subjectInfo, setSubjectInfo] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subjectId = (subjectParam || 'science').toLowerCase();

  useEffect(() => {
    async function loadChapters() {
      try {
        // FRONTEND BACKEND HOOK (page-level):
        // This page consumes GET /api/users/me/profile, GET /api/curriculum/subjects?class={userClass},
        // and GET /api/curriculum/subjects/:subjectId/chapters through authService.getProfile(),
        // curriculumService.getSubjects(), and curriculumService.getChapters().
        const profile = await authService.getProfile();
        setUser(profile);

        const userClass = profile.class ?? 10;
        const subjects = await curriculumService.getSubjects(userClass);
        const currentSubject = subjects.find((s) => s.id.toLowerCase() === subjectId) || null;
        setSubjectInfo(currentSubject);

        const chapterList = await curriculumService.getChapters(subjectId, userClass);
        setChapters(chapterList);
      } catch (err) {
        const { parseError } = await import('../services/http');
        setError(parseError(err));
      } finally {
        setLoading(false);
      }
    }
    loadChapters();
  }, [subjectId]);

  const subjectDisplayName = subjectInfo?.name || (subjectId.charAt(0).toUpperCase() + subjectId.slice(1));

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans overflow-x-hidden">
      {/* Persistent Authenticated Navbar - matching main page exactly */}
      <AppNavbar user={user} />

      <main className="flex-1 w-full px-8 md:px-12 py-6 sm:py-8 pb-24 md:pb-12 max-w-[1520px] mx-auto">
        {/* Header Section: Subject Title and Subtitle (No Class 9 badge, No Back Button) */}
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-2">
            {subjectDisplayName}
          </h1>
          <p className="text-stone-600 text-base sm:text-lg font-medium leading-relaxed">
            Select a chapter to explore concepts and practice.
          </p>
          {error && (
            <div role="alert" className="mt-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 max-w-2xl">
              {error} <button type="button" onClick={() => window.location.reload()} className="ml-2 font-bold underline">Retry</button>
            </div>
          )}
        </div>

        {/* Chapters Cards Grid - 3 containers in one line on desktop */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-64 bg-white/70 rounded-[28px] border border-stone-200/60 animate-pulse" />
            ))}
          </div>
        ) : chapters.length === 0 ? (
          <div className="bg-white rounded-[28px] border border-stone-200/80 p-12 text-center max-w-xl mx-auto">
            <BookOpen size={36} className="mx-auto text-stone-300 mb-3" />
            <p className="text-base font-semibold text-stone-700">No chapters found for this subject.</p>
            <Link to="/home" className="inline-block mt-4 text-sm font-bold text-[#6d0e00] hover:underline">
              Return to Curriculum
            </Link>
          </div>
        ) : (
          /* All Chapters in rows of 3 on desktop */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
            {chapters.map((chapter) => {
              const percentage = Math.round((chapter.mastered_concepts / chapter.total_concepts) * 100);
              const imageSrc = getChapterImage(subjectId, chapter.chapter_number);
              const cardBg = getChapterBgColor(chapter.chapter_number);

              return (
                <div
                  key={chapter.id}
                  id={`chapter-card-${chapter.id}`}
                  onClick={() => navigate(`/home/${subjectId}/${chapter.id}`)}
                  className={`group relative overflow-hidden rounded-[24px] sm:rounded-[28px] p-6 text-white cursor-pointer shadow-sm hover:shadow-xl flex items-center justify-between gap-4 min-h-[200px] transition-all duration-300 ease-out hover:scale-[1.03] active:scale-[1.01] ${cardBg}`}
                >
                  {/* Left: Content Section */}
                  <div className="flex-1 flex flex-col justify-between self-stretch z-10 pr-2">
                    <div>
                      {/* Chapter / Topic Name */}
                      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
                        {chapter.name}
                      </h2>

                      {/* Short Description */}
                      <p className="text-white/85 text-xs sm:text-sm font-normal mt-1.5 leading-relaxed line-clamp-2">
                        {chapter.description || `Explore essential principles and mastery exercises in ${chapter.name}.`}
                      </p>

                      {/* Concept Count */}
                      <div className="mt-2.5">
                        <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/95 px-2.5 py-0.5 rounded-full bg-black/15">
                          Chapter {String(chapter.chapter_number).padStart(2, '0')} &bull; {chapter.total_concepts} Concepts
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar & Percentage */}
                    <div className="pt-3.5 w-full max-w-[240px]">
                      <div className="flex items-center justify-between text-xs text-white/90 font-medium mb-1.5">
                        <span>Your Progress</span>
                        <span className="font-bold text-white">{percentage}%</span>
                      </div>
                      <div className="w-full bg-white/25 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-white h-full rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Extreme Right: Image scaled up inside container without enlarging container */}
                  <div className="shrink-0 flex items-center justify-center z-10 w-28 sm:w-32 md:w-36 h-28 sm:h-32 md:h-36">
                    <img
                      src={imageSrc}
                      alt={chapter.name}
                      className="max-h-full max-w-full object-contain drop-shadow-md select-none pointer-events-none scale-125 transition-transform duration-300 group-hover:scale-[1.35]"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleImageFallback(e)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

