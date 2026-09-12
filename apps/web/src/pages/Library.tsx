import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import { authService, curriculumService, UserProfile, Subject } from '../services/api';
import { getSubjectImage, handleImageFallback } from '../components/CardThemeUtils';

const LIBRARY_SUBJECT_COLORS: Record<string, string> = {
  science: 'bg-[#B45309]',
  maths: 'bg-[#7C3AED]',
  physics: 'bg-[#C2410C]',
  chemistry: 'bg-[#BE185D]',
  biology: 'bg-[#6B7280]',
};

const DEFAULT_LIBRARY_COLOR = 'bg-[#7C3AED]';

export default function Library() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user profile & class-specific subjects (2 for class <=10, 4 for class >=11)
  useEffect(() => {
    async function loadData() {
      try {
        // FRONTEND BACKEND HOOK (page-level):
        // This page uses GET /api/users/me/profile through the current user cache and
        // GET /api/curriculum/subjects?class={userClass} through curriculumService.getSubjects().
        const currentUser = authService.getCurrentUser();
        setUser(currentUser);

        const userClass = currentUser?.class ?? 10;
        const subjs = await curriculumService.getSubjects(userClass);
        setSubjects(subjs);
      } catch (err) {
        console.error('Failed to load subjects for library:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans text-stone-900 selection:bg-stone-900/10 selection:text-stone-900 overflow-x-hidden antialiased">
      {/* Persistent App Navbar */}
      <AppNavbar user={user} />

      {/* Main Content Container - Fully responsive */}
      <main className="flex-1 w-full px-4 sm:px-6 md:px-12 py-6 sm:py-8 pb-24 md:pb-12 max-w-[1520px] mx-auto space-y-6 sm:space-y-8">
        
        {/* Header Section: Single line text, responsive and clean */}
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-stone-950">
            Library
          </h1>
          <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-4xl">
            Explore Akara&apos;s complete repository of conceptual curriculum explainers, interactive visual modules, and multilingual depth.
          </p>
        </header>

        {/* Subject Chooser: 2 or 4 Containers based on Class - Moved down for better breathing room */}
        <div className="pt-4 sm:pt-6 space-y-6 sm:space-y-8">
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              What subject&apos;s library would you like to explore?
            </h2>
            <p className="text-xs sm:text-sm text-stone-500">
              Choose a subject to browse chapters, conceptual explainers, and translations.
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-72 bg-white/70 rounded-3xl animate-pulse border border-stone-200/60" />
              <div className="h-72 bg-white/70 rounded-3xl animate-pulse border border-stone-200/60" />
            </div>
          ) : (
            /* Responsive Grid: 2 columns for Class 9/10, up to 4 columns for Class 11/12 */
            <div
              className={`grid gap-6 sm:gap-8 w-full ${
                subjects.length <= 2
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              }`}
            >
              {subjects.map((subject) => {
                const bgColor = LIBRARY_SUBJECT_COLORS[subject.id.toLowerCase()] || DEFAULT_LIBRARY_COLOR;
                const imageSrc = getSubjectImage(subject.id);

                return (
                  <div
                    key={subject.id}
                    id={`library-subject-card-${subject.id}`}
                    onClick={() => navigate(`/library/${subject.id.toLowerCase()}`)}
                    className={`group relative overflow-hidden rounded-[28px] sm:rounded-[36px] p-7 sm:p-9 md:p-10 lg:p-11 text-white cursor-pointer shadow-sm hover:shadow-xl flex flex-col-reverse sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-8 min-h-[250px] sm:min-h-[290px] md:min-h-[320px] transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[1.005] ${bgColor}`}
                  >
                    {/* Left/Bottom: Content Section */}
                    <div className="flex-1 flex flex-col justify-between self-stretch z-10 pr-2 sm:pr-4">
                      <div>
                        {/* Subject Name */}
                        <h3 className="text-2xl sm:text-3xl lg:text-[32px] font-extrabold text-white tracking-tight leading-snug">
                          {subject.name}
                        </h3>

                        {/* Short Description */}
                        <p className="text-white/90 text-xs sm:text-sm font-normal mt-2 leading-relaxed line-clamp-2">
                          {subject.description}
                        </p>

                        {/* Concept Count & Chapters Count - strictly nowrap */}
                        <div className="mt-4">
                          <span className="inline-flex items-center whitespace-nowrap text-xs sm:text-sm font-semibold tracking-wider text-white px-3.5 sm:px-4 py-1.5 rounded-full bg-black/20 backdrop-blur-xs">
                            {subject.total_concepts} Concepts &bull; {subject.total_chapters} Chapters
                          </span>
                        </div>
                      </div>

                      {/* Explore Prompt - No Underline, No Arrow */}
                      <div className="mt-5 sm:mt-6 text-sm sm:text-base font-bold text-white/95">
                        <span>Explore {subject.name} Library</span>
                      </div>
                    </div>

                    {/* Right/Top: Subject Artwork Image - Responsive & generous size */}
                    <div className="shrink-0 self-end sm:self-center flex items-center justify-center z-10 w-32 sm:w-44 md:w-48 lg:w-52 h-32 sm:h-44 md:h-48 lg:h-52">
                      <img
                        src={imageSrc}
                        alt={subject.name}
                        className="max-h-full max-w-full object-contain drop-shadow-md select-none pointer-events-none scale-120 sm:scale-130 transition-transform duration-300 group-hover:scale-140"
                        referrerPolicy="no-referrer"
                        onError={(e) => handleImageFallback(e)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
