import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronDown, 
  Check, 
  RotateCcw,
  Play
} from 'lucide-react';
import { AppNavbar } from '../components/AppNavbar';
import { ConceptDetailsModal } from '../components/ConceptDetailsModal';
import { 
  libraryRepositoryService, 
  LibraryConcept, 
  SubjectSection 
} from '../services/libraryData';
import { authService, curriculumService, UserProfile, Chapter, Subject } from '../services/api';
import { ConceptNode, ConceptNodeStatus } from '../services/constellationData';

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'all', name: 'All Languages', nativeName: 'सभी भाषाएं' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
];

export default function SubjectLibrary() {
  const { subjectId: subjectIdParam } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const subjectId = (subjectIdParam || 'science').toLowerCase();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjectInfo, setSubjectInfo] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [sections, setSections] = useState<SubjectSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected chapter: 'all' or specific chapterId
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  // Selected language: 'all' or specific code ('hi', 'en', etc.)
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');

  // Custom dropdown states
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  const chapterDropdownRef = useRef<HTMLDivElement>(null);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [selectedConcept, setSelectedConcept] = useState<LibraryConcept | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (chapterDropdownRef.current && !chapterDropdownRef.current.contains(event.target as Node)) {
        setIsChapterDropdownOpen(false);
      }
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load subject info, chapters & concept sections
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // FRONTEND BACKEND HOOK (page-level):
        // This page consumes GET /api/users/me/profile, GET /api/curriculum/subjects?class={userClass},
        // GET /api/curriculum/subjects/:subjectId/chapters, and GET /api/library/hierarchy
        // through authService.getCurrentUser(), curriculumService.getSubjects(), curriculumService.getChapters(),
        // and libraryRepositoryService.getSubjectHierarchy().
        const currentUser = authService.getCurrentUser();
        setUser(currentUser);

        const userClass = currentUser?.class ?? 10;
        const [subjs, chaps, sec] = await Promise.all([
          curriculumService.getSubjects(userClass),
          curriculumService.getChapters(subjectId, userClass),
          libraryRepositoryService.getSubjectHierarchy('', subjectId),
        ]);

        const curSubject = subjs.find((s) => s.id.toLowerCase() === subjectId) || null;
        setSubjectInfo(curSubject);
        setChapters(chaps);
        setSections(sec);
      } catch (err) {
        console.error('Failed to load subject library data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [subjectId]);

  // Extract all concepts for this subject
  const allConcepts = useMemo(() => {
    const list: LibraryConcept[] = [];
    for (const sec of sections) {
      for (const dom of sec.domains) {
        for (const c of dom.concepts) {
          if (!list.some((existing) => existing.id === c.id)) {
            list.push(c);
          }
        }
      }
    }
    return list;
  }, [sections]);

  // Filter concepts based on selected chapter and selected language
  const filteredConcepts = useMemo(() => {
    return allConcepts.filter((c) => {
      // 1. Chapter filter
      if (selectedChapter !== 'all') {
        if (c.chapterId !== selectedChapter) return false;
      }

      // 2. Language filter
      if (selectedLanguage !== 'all') {
        if (!c.availableLanguages || !c.availableLanguages.includes(selectedLanguage)) {
          return false;
        }
      }

      return true;
    });
  }, [allConcepts, selectedChapter, selectedLanguage]);

  // Group filtered concepts by domain (when all chapters) or by topic (when a specific chapter is selected)
  const groupedConcepts = useMemo(() => {
    const map = new Map<string, LibraryConcept[]>();
    filteredConcepts.forEach((concept) => {
      // When a chapter is selected, show all topics inside that chapter that have videos available
      const groupKey = selectedChapter !== 'all'
        ? (concept.topicName || 'General Topics')
        : (concept.domain || concept.chapterName || 'General');
      if (!map.has(groupKey)) {
        map.set(groupKey, []);
      }
      map.get(groupKey)!.push(concept);
    });
    return Array.from(map.entries());
  }, [filteredConcepts, selectedChapter]);

  // Active language details
  const activeLanguage = useMemo(() => {
    return SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];
  }, [selectedLanguage]);

  // Active chapter details
  const activeChapter = useMemo(() => {
    if (selectedChapter === 'all') return null;
    return chapters.find((ch) => ch.id === selectedChapter) || null;
  }, [chapters, selectedChapter]);

  // Modal concept adapter
  const modalConceptNode: ConceptNode | null = useMemo(() => {
    if (!selectedConcept) return null;
    return {
      id: selectedConcept.id,
      order: selectedConcept.order,
      name: selectedConcept.name,
      shortDescription: selectedConcept.shortDescription,
      status: 'available' as ConceptNodeStatus,
      topic_id: selectedConcept.chapterId,
      topic_number: 1,
      topic_name: selectedConcept.topicName,
      prerequisite_id: selectedConcept.prerequisiteId || null,
      prerequisite_name: selectedConcept.prerequisiteName,
      video_duration: `${selectedConcept.videoDurationMinutes} min`,
      chapter_id: selectedConcept.chapterId,
      chapter_name: selectedConcept.chapterName,
      subject_id: selectedConcept.subjectId,
      subject_name: selectedConcept.subjectName,
    };
  }, [selectedConcept]);

  const handleOpenConcept = (concept: LibraryConcept) => {
    setSelectedConcept(concept);
    setIsModalOpen(true);
  };

  const handleLearnAction = (node: ConceptNode) => {
    setIsModalOpen(false);
    const lang = selectedLanguage !== 'all' ? selectedLanguage : (user?.default_language || 'hi');
    const subj = node.subject_id || subjectId;
    const ch = node.chapter_id || 'chemical-reactions';
    navigate(`/learn/${node.id}?subject=${subj}&chapter=${ch}&lang=${lang}`);
  };

  const handleExplainAction = (node: ConceptNode) => {
    setIsModalOpen(false);
    const lang = selectedLanguage !== 'all' ? selectedLanguage : (user?.default_language || 'hi');
    const subj = node.subject_id || subjectId;
    const ch = node.chapter_id || 'chemical-reactions';
    navigate(`/feynman/${node.id}?subject=${subj}&chapter=${ch}&lang=${lang}`);
  };

  const handlePracticeAction = (node: ConceptNode) => {
    setIsModalOpen(false);
    const lang = selectedLanguage !== 'all' ? selectedLanguage : (user?.default_language || 'hi');
    const subj = node.subject_id || subjectId;
    const ch = node.chapter_id || 'chemical-reactions';
    navigate(`/practice/${node.id}?subject=${subj}&chapter=${ch}&lang=${lang}`);
  };

  const subjectDisplayName = subjectInfo?.name || (subjectId.charAt(0).toUpperCase() + subjectId.slice(1));

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans text-stone-900 selection:bg-stone-900/10 selection:text-stone-900 overflow-x-hidden">
      {/* Persistent App Navbar */}
      <AppNavbar user={user} />

      {/* Main Container - Fully responsive */}
      <main className="flex-1 w-full px-4 sm:px-6 md:px-12 py-6 sm:py-8 pb-24 md:pb-12 max-w-[1520px] mx-auto space-y-6 sm:space-y-8">
        
        {/* 1. Header with Breadcrumb Back to /library */}
        <header className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#1a1a1a] tracking-tight">
                {subjectDisplayName} Library
              </h1>
              <p className="text-xs sm:text-sm text-stone-600 mt-1">
                Select a chapter to explore all its concepts, and filter by your preferred language.
              </p>
            </div>
          </div>
        </header>

        {/* 2. Controls: Chapter Dropdown & Language Dropdown */}
        <section aria-label="Library Filters" className="bg-white rounded-[32px] p-4 sm:p-6 shadow-2xs border border-stone-200/80">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-start">
            
            {/* Control 1: Select Chapter Dropdown */}
            <div className="relative space-y-1.5" ref={chapterDropdownRef}>
              <label 
                htmlFor="select-chapter-button"
                className="block text-xs font-bold text-stone-600 uppercase tracking-wider"
              >
                Select Chapter
              </label>

              <button
                type="button"
                id="select-chapter-button"
                onClick={() => {
                  setIsChapterDropdownOpen(!isChapterDropdownOpen);
                  setIsLangDropdownOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#FAF8F5] hover:bg-stone-100/80 rounded-full border border-stone-200 text-sm font-medium text-stone-900 focus:outline-hidden focus:border-stone-900 shadow-2xs cursor-pointer transition-all text-left"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <span
                    className="truncate"
                    title={selectedChapter === 'all' ? 'All Chapters' : (activeChapter ? `Chapter ${activeChapter.chapter_number}: ${activeChapter.name}` : selectedChapter)}
                  >
                    {selectedChapter === 'all' 
                      ? 'All Chapters' 
                      : (activeChapter ? `Chapter ${activeChapter.chapter_number}: ${activeChapter.name}` : selectedChapter)}
                  </span>
                </div>
                <ChevronDown 
                  size={18} 
                  className={`text-stone-500 transition-transform shrink-0 ${isChapterDropdownOpen ? 'rotate-180' : ''}`} 
                />
              </button>

              {/* Dropdown Menu for Chapters */}
              <AnimatePresence>
                {isChapterDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-stone-200/90 shadow-xl z-30 max-h-72 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChapter('all');
                        setIsChapterDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer text-left ${
                        selectedChapter === 'all'
                          ? 'bg-stone-900 text-white font-semibold'
                          : 'text-stone-800 hover:bg-stone-100'
                      }`}
                    >
                      <span>All Chapters ({allConcepts.length} concepts)</span>
                      {selectedChapter === 'all' && <Check size={16} />}
                    </button>

                    {chapters.map((ch) => {
                      const isSelected = selectedChapter === ch.id;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => {
                            setSelectedChapter(ch.id);
                            setIsChapterDropdownOpen(false);
                          }}
                          title={`Chapter ${ch.chapter_number}: ${ch.name}`}
                          className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-stone-900 text-white font-semibold'
                              : 'text-stone-800 hover:bg-stone-100'
                          }`}
                        >
                          <span className="flex-1 min-w-0 whitespace-normal break-words leading-snug">
                            Chapter {ch.chapter_number}: {ch.name}
                          </span>
                          {isSelected && <Check size={16} className="shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Control 2: Select Language Dropdown (Properly structured and rendered) */}
            <div className="relative space-y-1.5" ref={langDropdownRef}>
              <label 
                htmlFor="select-language-button"
                className="block text-xs font-bold text-stone-600 uppercase tracking-wider"
              >
                Select Language
              </label>

              <button
                type="button"
                id="select-language-button"
                onClick={() => {
                  setIsLangDropdownOpen(!isLangDropdownOpen);
                  setIsChapterDropdownOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#FAF8F5] hover:bg-stone-100/80 rounded-full border border-stone-200 text-sm font-medium text-stone-900 focus:outline-hidden focus:border-stone-900 shadow-2xs cursor-pointer transition-all text-left"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="font-semibold text-stone-900">
                    {activeLanguage.name}
                  </span>
                  {activeLanguage.code !== 'all' && (
                    <span className="text-stone-500 text-xs">
                      ({activeLanguage.nativeName})
                    </span>
                  )}
                </div>
                <ChevronDown 
                  size={18} 
                  className={`text-stone-500 transition-transform shrink-0 ${isLangDropdownOpen ? 'rotate-180' : ''}`} 
                />
              </button>

              {/* Dropdown Menu for Languages */}
              <AnimatePresence>
                {isLangDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-stone-200/90 shadow-xl z-30 max-h-72 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => {
                      const isSelected = selectedLanguage === lang.code;
                      // Count concepts supporting this language
                      const count = lang.code === 'all' 
                        ? allConcepts.length 
                        : allConcepts.filter((c) => c.availableLanguages?.includes(lang.code)).length;

                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => {
                            setSelectedLanguage(lang.code);
                            setIsLangDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-stone-900 text-white font-semibold'
                              : 'text-stone-800 hover:bg-stone-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{lang.name}</span>
                            {lang.code !== 'all' && (
                              <span className={isSelected ? 'text-white/80 text-xs' : 'text-stone-500 text-xs'}>
                                ({lang.nativeName})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'}`}>
                              {count}
                            </span>
                            {isSelected && <Check size={16} className="shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </section>

        {/* 3. Concepts Grid */}
        {loading ? (
          <div className="space-y-6">
            <div className="h-40 bg-white/70 rounded-3xl animate-pulse border border-stone-200/60" />
            <div className="h-40 bg-white/70 rounded-3xl animate-pulse border border-stone-200/60" />
          </div>
        ) : filteredConcepts.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200 p-10 sm:p-14 text-center max-w-md mx-auto space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 mx-auto flex items-center justify-center">
              <RotateCcw size={22} />
            </div>
            <h3 className="text-base font-bold text-stone-900">
              No Concepts in This Language
            </h3>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              No concepts in {activeChapter ? `"${activeChapter.name}"` : 'this subject'} currently have visual explainers translated into {activeLanguage.name} ({activeLanguage.nativeName}).
            </p>
            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                type="button"
                onClick={() => setSelectedLanguage('all')}
                className="px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-all cursor-pointer"
              >
                Show All Languages
              </button>
              {selectedChapter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedChapter('all')}
                  className="px-4 py-2.5 rounded-xl bg-stone-100 text-stone-800 text-xs font-bold hover:bg-stone-200 transition-all cursor-pointer"
                >
                  View All Chapters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Chapter Header Banner when a specific chapter is selected */}
            {selectedChapter !== 'all' && activeChapter && (
              <div className="bg-[#FAF8F5] rounded-[28px] p-5 sm:p-6 border border-stone-200/90 shadow-2xs">
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-extrabold text-stone-900 tracking-tight">
                    {activeChapter.name}
                  </h2>
                  {activeChapter.description && (
                    <p className="text-xs sm:text-sm text-stone-600 max-w-2xl">
                      {activeChapter.description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {groupedConcepts.map(([groupName, concepts]) => (
              <div key={groupName} className="space-y-4">
                {/* Topic Header when Chapter is Selected, or Domain Header */}
                {selectedChapter !== 'all' ? (
                  <div className="pb-1">
                    <h3 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                      {groupName}
                    </h3>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
                      {groupName}
                    </span>
                    <span className="text-xs font-bold text-stone-400">
                      ({concepts.length})
                    </span>
                  </div>
                )}

                {/* Concept Cards Grid - Fully responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
                  {concepts.map((concept) => {
                    return (
                      <motion.div
                        key={concept.id}
                        id={`concept-card-${concept.id}`}
                        whileHover={{ y: -3 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => handleOpenConcept(concept)}
                        className="group relative rounded-[28px] p-5 border border-stone-200/90 hover:border-stone-400 bg-white text-left cursor-pointer transition-all flex flex-col justify-between shadow-2xs hover:shadow-md"
                      >
                        <div className="space-y-2">
                          {/* Concept Name */}
                          <h3 className="text-base font-bold text-stone-900 group-hover:text-stone-700 transition-colors leading-snug">
                            {concept.name}
                          </h3>

                          {/* Short Description */}
                          <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                            {concept.shortDescription}
                          </p>
                        </div>

                        {/* Card Footer */}
                        <div className="pt-3 mt-3 flex items-center justify-between gap-2">
                          <span className="inline-block text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            Available
                          </span>

                          <span className="text-xs font-bold text-stone-500 group-hover:text-stone-900 transition-colors">
                            Explore
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Action Sheet Modal */}
      <ConceptDetailsModal
        concept={modalConceptNode}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMasterConcept={() => {}}
        onLearn={handleLearnAction}
        onExplain={handleExplainAction}
        onPractice={handlePracticeAction}
      />
    </div>
  );
}
