import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AppNavbar } from '../components/AppNavbar';
import { authService, curriculumService, UserProfile, Subject } from '../services/api';
import { HOMEPAGE_SUBJECT_COLORS, DEFAULT_HOMEPAGE_COLOR, getSubjectImage, handleImageFallback } from '../components/CardThemeUtils';

export default function HomeDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // FRONTEND BACKEND HOOK (page-level):
        // This page consumes GET /api/users/me/profile and GET /api/curriculum/subjects?class={userClass}.
        // The actual API call is happening through authService.getProfile() and curriculumService.getSubjects().
        const profile = await authService.getProfile();
        setUser(profile);

        const userClass = profile.class ?? 10;
        const subjs = await curriculumService.getSubjects(userClass);
        setSubjects(subjs);
      } catch (err) {
        const { parseError } = await import('../services/http');
        setError(parseError(err));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const userName = user?.name || 'Student';
  const userClass = user?.class ?? 10;
  const isTwoSubjects = subjects.length <= 2;

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans overflow-x-hidden">
      {/* Persistent Authenticated Navbar */}
      <AppNavbar user={user} />

      <main className="flex-1 w-full px-8 md:px-12 py-6 sm:py-8 pb-24 md:pb-12 max-w-[1520px] mx-auto">
        {/* Header Section with User Welcome & Class Info */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-2">
            Welcome {userName}
          </h1>
          <p className="text-stone-600 text-base sm:text-lg font-medium leading-relaxed">
            Here is your curriculum for Grade {userClass}
          </p>
          {error && (
            <div role="alert" className="mt-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 max-w-2xl">
              {error} <button type="button" onClick={() => window.location.reload()} className="ml-2 font-bold underline">Retry</button>
            </div>
          )}
        </div>

        {/* Main Content Layout: Subject Cards on the Left & home.png on the Right */}
        <div className="flex flex-col lg:flex-row items-center lg:items-stretch justify-between gap-8 lg:gap-10 xl:gap-14">
          {/* Left Column: Subject Cards */}
          <div className={`w-full ${isTwoSubjects ? 'max-w-2xl lg:max-w-[720px] xl:max-w-[780px] 2xl:max-w-[820px]' : 'lg:flex-[1.3] xl:flex-[1.35]'}`}>
            {loading ? (
              <div className={`grid gap-4 sm:gap-5 ${isTwoSubjects ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {[1, 2, 3, 4].slice(0, isTwoSubjects ? 2 : 4).map((n) => (
                  <div
                    key={n}
                    className={`bg-white/70 rounded-[22px] border border-stone-200/60 animate-pulse ${
                      isTwoSubjects ? 'h-40 sm:h-44' : 'h-44'
                    }`}
                  />
                ))}
              </div>
            ) : (
              <div
                className={`grid gap-4 sm:gap-5 ${
                  isTwoSubjects
                    ? 'grid-cols-1' // 2 subjects: one below the other
                    : 'grid-cols-1 sm:grid-cols-2' // 4 subjects: 2 in one row and 2 below it
                } ${isTwoSubjects ? 'items-stretch' : ''}`}
              >
                {subjects.map((subject) => {
                  const bgColor = HOMEPAGE_SUBJECT_COLORS[subject.id.toLowerCase()] || DEFAULT_HOMEPAGE_COLOR;
                  const percentage = Math.round((subject.mastered_concepts / subject.total_concepts) * 100);
                  const imageSrc = getSubjectImage(subject.id);

                  return (
                    <div
                      key={subject.id}
                      id={`subject-card-${subject.id}`}
                      onClick={() => navigate(`/home/${subject.id}`)}
                      className={`group relative overflow-hidden rounded-[22px] sm:rounded-[24px] px-5 py-4 sm:px-6 sm:py-5 text-white cursor-pointer shadow-sm hover:shadow-lg flex items-center justify-between gap-4 sm:gap-5 ${isTwoSubjects ? 'min-h-[230px] sm:min-h-[250px]' : 'min-h-[178px] sm:min-h-[188px]'} transition-all duration-300 ease-out hover:scale-[1.025] active:scale-[1.01] ${bgColor}`}
                    >
                      {/* Left: Content Section */}
                      <div className="flex-1 flex flex-col justify-between self-stretch z-10 pr-2">
                        <div>
                          {/* Subject Name */}
                          <h2 className="text-2xl sm:text-3xl lg:text-[30px] font-extrabold text-white tracking-tight leading-snug">
                            {subject.name}
                          </h2>

                          {/* Short Description */}
                          <p className="text-white/90 text-sm sm:text-base font-normal mt-1 leading-snug line-clamp-2">
                            {subject.description}
                          </p>

                          {/* Concept Count / Chapters Count */}
                          <div className="mt-2">
                            <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white px-2.5 py-0.5 rounded-full bg-black/20 backdrop-blur-xs">
                              {subject.total_concepts} Concepts &bull; {subject.total_chapters} Chapters
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar - neat spacing below concepts text */}
                        <div className="mt-3 w-full max-w-[275px]">
                          <div className="flex items-center justify-between text-xs sm:text-sm text-white font-medium mb-1">
                            <span>Your Progress</span>
                            <span className="font-bold text-white text-sm sm:text-base">{percentage}%</span>
                          </div>
                          <div className="w-full bg-white/25 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-white h-full rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Extreme Right: Scaled image wrapper tailored to container */}
                      <div className="shrink-0 flex items-center justify-center z-10 w-32 sm:w-40 md:w-44 h-32 sm:h-40 md:h-44">
                        <img
                          src={imageSrc}
                          alt={subject.name}
                          className="max-h-full max-w-full object-contain drop-shadow-md select-none pointer-events-none scale-125 sm:scale-140 transition-transform duration-300 group-hover:scale-150"
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

          {/* Right Column: Flipped home.png Illustration with smooth up-down floating animation */}
          <div className="w-full lg:flex-1 shrink-0 self-stretch flex items-center justify-center lg:justify-end min-h-0">
            <motion.div
              animate={{
                y: [-10, 10, -10],
              }}
              transition={{
                repeat: Infinity,
                duration: 4.5,
                ease: 'easeInOut',
              }}
              className="relative w-full h-full max-h-full flex items-center justify-center lg:justify-end"
            >
              <img
                src="/home.png"
                alt="Student learning with digital tutor"
                className="h-full w-auto max-h-full object-contain object-right select-none pointer-events-none drop-shadow-sm"
                loading="eager"
                onError={(e) => handleImageFallback(e, '/home_original.png')}
              />
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}


