import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AppNavbar } from '../components/AppNavbar';
import { authService, curriculumService, UserProfile, Chapter, Subject } from '../services/api';
import {
  progressService,
  SubjectProgressGroup,
  TouchedConcept,
} from '../services/progressData';
import {
  diagnosticService,
  MisconceptionDiagnostic,
} from '../services/diagnosticData';
import { constellationNavService } from '../services/constellationNav';
import { ActivityHabitCalendar } from '../components/ActivityHabitCalendar';
import { CheckCircle2 } from 'lucide-react';

interface SubjectCardData {
  id: string;
  name: string;
  code: string;
  description: string;
  totalConcepts: number;
  masteredCount: number;
  revisitCount: number;
  percentage: number;
  chaptersCount: number;
}

interface WeakConceptItem {
  id: string;
  conceptId: string;
  conceptName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  topicName: string;
  insight: string;
  hint: string;
  severity: 'high' | 'medium' | 'low';
}

export default function Progress() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [loading, setLoading] = useState(true);

  const [subjectsList, setSubjectsList] = useState<Subject[]>([]);
  const [chaptersBySubject, setChaptersBySubject] = useState<Record<string, Chapter[]>>({});
  const [diagnostics, setDiagnostics] = useState<MisconceptionDiagnostic[]>([]);
  const [touchedGroups, setTouchedGroups] = useState<SubjectProgressGroup[]>([]);

  // Active selected subject for breakdown
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  useEffect(() => {
    async function loadProgressData() {
      try {
        // FRONTEND BACKEND HOOK (page-level):
        // This page consumes GET /api/users/me/profile, GET /api/curriculum/subjects?class={userClass},
        // GET /api/diagnostics/misconceptions, and GET /api/progress/learning-map via
        // authService.getProfile(), curriculumService.getSubjects(), diagnosticService.getActiveDiagnostics(),
        // and progressService.getTouchedConceptsBySubject().
        const profile = await authService.getProfile();
        setUser(profile);

        // Record student activity for today
        progressService.logActivity();

        const userClass = profile.class ?? 10;
        const [subjs, diags, groups] = await Promise.all([
          curriculumService.getSubjects(userClass),
          diagnosticService.getActiveDiagnostics(),
          progressService.getTouchedConceptsBySubject(),
        ]);

        setSubjectsList(subjs);
        setDiagnostics(diags);
        setTouchedGroups(groups);

        // Default selected subject
        if (subjs.length > 0) {
          setSelectedSubjectId(subjs[0].id.toLowerCase());
        }

        // Load chapters for all subjects
        const chaptersMap: Record<string, Chapter[]> = {};
        for (const subj of subjs) {
          const chaps = await curriculumService.getChapters(subj.id, userClass);
          chaptersMap[subj.id.toLowerCase()] = chaps;
        }
        setChaptersBySubject(chaptersMap);
      } catch (err) {
        console.error('Failed to load progress data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadProgressData();
  }, []);

  // Compute metrics for each individual subject card
  const subjectCards: SubjectCardData[] = useMemo(() => {
    return subjectsList.map((subj) => {
      const sId = subj.id.toLowerCase();
      const chapters = chaptersBySubject[sId] || [];

      // Calculate total & mastered concepts
      const totalConcepts = chapters.reduce((acc, ch) => acc + ch.total_concepts, 0) || subj.total_concepts || 50;
      const masteredCount = chapters.reduce((acc, ch) => acc + ch.mastered_concepts, 0) || subj.mastered_concepts || 0;

      // Count weak / needs revisit concepts for this subject
      const subjectDiags = diagnostics.filter((d) => d.subjectId.toLowerCase() === sId);
      const touchedInSubj = touchedGroups.find((g) => g.subjectId.toLowerCase() === sId);
      const touchedNeedsRevisit = touchedInSubj
        ? touchedInSubj.concepts.filter((c) => c.status === 'needs-revisit').length
        : 0;

      const revisitCount = Math.max(subjectDiags.length, touchedNeedsRevisit);
      const percentage = totalConcepts > 0 ? Math.round((masteredCount / totalConcepts) * 100) : 0;

      return {
        id: sId,
        name: subj.name,
        code: subj.code,
        description: subj.description,
        totalConcepts,
        masteredCount,
        revisitCount,
        percentage,
        chaptersCount: chapters.length || subj.total_chapters || 8,
      };
    });
  }, [subjectsList, chaptersBySubject, diagnostics, touchedGroups]);

  // Selected subject object
  const activeSubject = useMemo(() => {
    return subjectCards.find((s) => s.id === selectedSubjectId) || subjectCards[0];
  }, [subjectCards, selectedSubjectId]);

  // Chapters of the selected subject
  const activeChapters = useMemo(() => {
    if (!activeSubject) return [];
    return chaptersBySubject[activeSubject.id] || [];
  }, [activeSubject, chaptersBySubject]);

  // Weak concepts / topics for selected subject that user MUST revisit
  const activeWeakConcepts: WeakConceptItem[] = useMemo(() => {
    if (!activeSubject) return [];
    const list: WeakConceptItem[] = [];
    const sId = activeSubject.id;

    // 1. Misconception Diagnostics for this subject
    diagnostics
      .filter((d) => d.subjectId.toLowerCase() === sId)
      .forEach((d) => {
        list.push({
          id: d.id,
          conceptId: d.conceptId,
          conceptName: d.conceptName,
          subjectId: d.subjectId,
          subjectName: d.subjectName,
          chapterId: d.chapterId,
          chapterName: d.chapterName,
          topicName: d.topicName,
          insight: d.diagnosticInsight,
          hint: d.actionableHint,
          severity: d.severity,
        });
      });

    // 2. Touched concepts marked as needs-revisit
    const touchedInSubj = touchedGroups.find((g) => g.subjectId.toLowerCase() === sId);
    if (touchedInSubj) {
      touchedInSubj.concepts
        .filter((c) => c.status === 'needs-revisit')
        .forEach((c) => {
          if (!list.some((existing) => existing.conceptId === c.id)) {
            list.push({
              id: `weak-${c.id}`,
              conceptId: c.id,
              conceptName: c.name,
              subjectId: sId,
              subjectName: activeSubject.name,
              chapterId: c.chapterId,
              chapterName: c.chapterName,
              topicName: c.topicName,
              insight: 'Concept marked for review due to incorrect practice question attempts.',
              hint: 'Review core foundational principles and attempt practice questions again to verify mastery.',
              severity: 'medium',
            });
          }
        });
    }

    return list;
  }, [activeSubject, diagnostics, touchedGroups]);

  // Mastered concepts for selected subject
  const activeMasteredConcepts = useMemo(() => {
    if (!activeSubject) return [];
    const touchedInSubj = touchedGroups.find((g) => g.subjectId.toLowerCase() === activeSubject.id);
    if (!touchedInSubj) return [];
    return touchedInSubj.concepts.filter((c) => c.status === 'mastered');
  }, [activeSubject, touchedGroups]);

  const handleReviewInConstellation = (subjId: string, chapId: string, concId: string) => {
    constellationNavService.navigateToConcept(navigate, subjId, chapId, concId);
  };

  const handlePracticeConcept = (concId: string, subjId: string, chapId: string) => {
    navigate(`/practice/${concId}?subject=${subjId}&chapter=${chapId}`);
  };

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans text-stone-900 selection:bg-stone-900/10 selection:text-stone-900 overflow-x-hidden antialiased">
      {/* Persistent Authenticated Navbar */}
      <AppNavbar user={user} />

      <main className="flex-1 w-full px-4 sm:px-6 md:px-12 py-6 sm:py-8 pb-24 md:pb-12 max-w-[1520px] mx-auto space-y-8 sm:space-y-10">
        
        {/* 1. Header */}
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight">
            Your Progress
          </h1>
          <p className="text-stone-600 text-sm sm:text-base font-normal max-w-2xl leading-relaxed">
            Personal performance metrics, weak topics needing urgent revisit, and chapter breakdowns.
          </p>
        </header>

        {loading ? (
          <div className="space-y-8 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-44 bg-[#FAF8F5] rounded-3xl border border-stone-200/80" />
              <div className="h-44 bg-[#FAF8F5] rounded-3xl border border-stone-200/80" />
            </div>
            <div className="h-72 bg-[#FAF8F5] rounded-3xl border border-stone-200/80" />
          </div>
        ) : (
          <div className="space-y-10">
            
            {/* 2. SUBJECT CARDS:
                - 4 separate cards if Class 11/12 (Physics, Chemistry, Maths, Biology)
                - 2 separate cards if Class 6-10 (Science, Maths)
                - Background #FAF8F5 matching the Activity Calendar
                - In each card: Mastered count, Needs Revisit count, total concepts, progress bar.
                - Clicking a card selects it and opens its breakdown below.
            */}
            <section aria-label="Subject Progress Overview" className="space-y-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
                  Subject Overview
                </h2>
                <p className="text-xs sm:text-sm text-stone-500">
                  Click any subject card to view its detailed breakdown and weak topics to revisit.
                </p>
              </div>

              {/* Responsive Cards Grid */}
              <div
                className={`grid gap-5 sm:gap-6 ${
                  subjectCards.length <= 2
                    ? 'grid-cols-1 md:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
                }`}
              >
                {subjectCards.map((subject) => {
                  const isSelected = selectedSubjectId === subject.id;

                  return (
                    <motion.div
                      key={subject.id}
                      id={`subject-card-${subject.id}`}
                      whileHover={{ y: -3 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => setSelectedSubjectId(subject.id)}
                      className={`relative rounded-3xl p-5 sm:p-6 cursor-pointer transition-all flex flex-col justify-between shadow-2xs text-left ${
                        isSelected
                          ? 'bg-[#FAF8F5] border-2 border-stone-900 shadow-md ring-2 ring-stone-900/10'
                          : 'bg-[#FAF8F5] border border-stone-200/90 hover:border-stone-400 hover:shadow-sm'
                      }`}
                    >
                      {/* Top Row: Subject Title & Selection Badge */}
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">
                              {subject.name}
                            </h3>
                          </div>

                          <div>
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-stone-900 px-2.5 py-1 rounded-full">
                                Viewing
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600 bg-stone-200/60 hover:bg-stone-200 px-2.5 py-1 rounded-full transition-colors">
                                View
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Mastered Metric */}
                        <div className="space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
                              {subject.masteredCount}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold text-stone-600">
                              / {subject.totalConcepts} Concepts Mastered
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full bg-stone-200/60 rounded-full h-2.5 overflow-hidden mt-2">
                            <div
                              className="bg-[#166534] h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(subject.percentage, 4)}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[11px] text-stone-600 font-medium pt-0.5">
                            <span>Mastery Rate</span>
                            <span className="font-bold text-stone-700">{subject.percentage}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer: Needs Revisit Count Badge - Clean without dividing lines or chapter counts */}
                      <div className="pt-3 mt-3 flex items-center justify-between">
                        {subject.revisitCount > 0 ? (
                          <div className="inline-flex items-center text-xs font-bold text-[#6d0e00] bg-[#FDF2F0] px-3 py-1.5 rounded-xl border border-[#F4D2CC]">
                            <span>{subject.revisitCount} {subject.revisitCount === 1 ? 'Concept' : 'Concepts'} to Revisit</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                            <CheckCircle2 size={13} strokeWidth={2.4} />
                            <span>All Clear &bull; No Weak Gaps</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* 3. BREAKDOWN VIEW FOR SELECTED SUBJECT + ACTIVITY HABIT CALENDAR
                - Left Side (wide): Selected Subject's Cards Breakdown (Weak topics, chapters, mastered)
                - Right Side (extreme end): Daily Activity Calendar with smileys
                - All content cards styled with calendar background #FAF8F5
            */}
            {activeSubject && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                
                {/* Left Side: Subject Detailed Breakdown Cards (original width) */}
                <div className="xl:col-span-8 space-y-8">
                  {/* Section A: Weak Topics & Concepts to Revisit - Danger sign & two weak areas badge removed */}
                  <section aria-labelledby="heading-weak-topics" className="space-y-4">
                    <div>
                      <h3 id="heading-weak-topics" className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
                        Topics &amp; Concepts Requiring Revisit
                      </h3>
                      <p className="text-xs text-stone-500">
                        Concepts identified with misconceptions or low practice accuracy in {activeSubject.name}.
                      </p>
                    </div>

                    {activeWeakConcepts.length === 0 ? (
                      <div className="bg-[#FAF8F5] rounded-3xl border border-stone-200/90 p-8 text-center space-y-2 shadow-2xs">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center">
                          <CheckCircle2 size={22} />
                        </div>
                        <h4 className="text-sm font-bold text-stone-900">
                          No Weak Topics in {activeSubject.name}!
                        </h4>
                        <p className="text-xs text-stone-500 max-w-md mx-auto">
                          You currently have no unresolved diagnostic errors or flagged misconceptions in this subject. Great work!
                        </p>
                      </div>
                    ) : (
                      /* Grid of Weak Topic Cards */
                      <div className="grid grid-cols-1 gap-4">
                        {activeWeakConcepts.map((item) => (
                          <motion.div
                            key={item.id}
                            id={`weak-topic-card-${item.conceptId}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#FAF8F5] rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-2xs hover:border-[#6d0e00]/50 transition-all space-y-3.5"
                          >
                            {/* Card Header: Context & Badge */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500 font-medium">
                                <span className="font-bold text-[#6d0e00] uppercase tracking-wider">
                                  {item.chapterName}
                                </span>
                                <span>&bull;</span>
                                <span>{item.topicName}</span>
                              </div>

                              <span className="text-[11px] font-bold text-[#6d0e00] bg-[#FDF2F0] px-2.5 py-0.5 rounded-full border border-[#F4D2CC]">
                                Needs Revisit
                              </span>
                            </div>

                            {/* Concept Title */}
                            <h4 className="text-base sm:text-lg font-bold text-stone-950">
                              {item.conceptName}
                            </h4>

                            {/* Identified Misconception / Gap Box */}
                            <div className="bg-[#F3EFEA] p-3.5 rounded-2xl border border-stone-200/80 space-y-2 text-xs">
                              <p className="text-stone-800 leading-relaxed">
                                <span className="font-bold text-[#6d0e00]">Identified Gap: </span>
                                {item.insight}
                              </p>
                              <p className="text-stone-600 leading-relaxed">
                                <span className="font-semibold text-stone-800">Key Principle: </span>
                                {item.hint}
                              </p>
                            </div>

                            {/* Action Buttons: Review in Constellation & Practice - Arrow removed */}
                            <div className="pt-1 flex flex-col sm:flex-row items-center gap-2.5 justify-end">
                              <button
                                type="button"
                                id={`practice-weak-btn-${item.conceptId}`}
                                onClick={() => handlePracticeConcept(item.conceptId, activeSubject.id, item.chapterId)}
                                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-stone-200/70 hover:bg-stone-300/70 text-stone-800 text-xs font-bold transition-all cursor-pointer text-center"
                              >
                                Practice Questions
                              </button>

                              <button
                                type="button"
                                id={`review-weak-btn-${item.conceptId}`}
                                onClick={() => handleReviewInConstellation(activeSubject.id, item.chapterId, item.conceptId)}
                                className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-[#6d0e00] hover:bg-[#540a00] text-white text-xs font-bold transition-all shadow-2xs cursor-pointer text-center"
                              >
                                <span>Review in Constellation</span>
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </section>

                </div>

                {/* Right Side / Extreme End: Daily Activity Calendar with Smileys (original width) */}
                <div className="xl:col-span-4 w-full flex flex-col items-center xl:items-end">
                  <div className="w-full sticky top-6">
                    <ActivityHabitCalendar user={user} />
                  </div>
                </div>
                {/* Section B: Chapters in this Subject (stretched full-width below the revisit cards) */}
                <section aria-labelledby="heading-chapters-breakdown" className="xl:col-span-12 space-y-4">
                  <div>
                    <h3 id="heading-chapters-breakdown" className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
                      Chapters in {activeSubject.name}
                    </h3>
                    <p className="text-xs text-stone-500">
                      Overview of concept completion and weaknesses per chapter.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {activeChapters.map((chapter) => {
                      const chapterPct = chapter.total_concepts > 0 
                        ? Math.round((chapter.mastered_concepts / chapter.total_concepts) * 100) 
                        : 0;

                      // Check if this chapter has weak concepts
                      const hasWeak = activeWeakConcepts.some((w) => w.chapterId === chapter.id);

                      return (
                        <div
                          key={chapter.id}
                          id={`chapter-breakdown-card-${chapter.id}`}
                          className="bg-[#FAF8F5] rounded-3xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between space-y-3"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-stone-600">
                                Chapter {chapter.chapter_number}
                              </span>
                              {hasWeak ? (
                                <span className="text-[10px] font-bold text-[#6d0e00] bg-[#FDF2F0] px-2 py-0.5 rounded-md border border-[#F4D2CC]">
                                  Needs Revisit
                                </span>
                              ) : chapterPct === 100 ? (
                                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  Completed
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-stone-600 bg-stone-200/60 px-2 py-0.5 rounded-md">
                                  In Progress
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm sm:text-base font-bold text-stone-900 line-clamp-2">
                              {chapter.name}
                            </h4>
                          </div>

                          <div className="space-y-1.5 pt-2">
                            <div className="flex justify-between text-xs text-stone-600 font-medium">
                              <span>{chapter.mastered_concepts} / {chapter.total_concepts} mastered</span>
                              <span className="font-bold text-stone-900">{chapterPct}%</span>
                            </div>
                            <div className="w-full bg-stone-200/60 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-[#166534] h-full rounded-full"
                                style={{ width: `${chapterPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

          </div>
        )}

      </main>
    </div>
  );
}
