import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import { authService, curriculumService, UserProfile, Chapter } from '../services/api';
import { CHAPTER_DATABASE } from '../services/curriculumData';
import {
  constellationService,
  ChapterConstellation,
  ConceptNode,
} from '../services/constellationData';
import { ConstellationPath } from '../components/ConstellationPath';
import { ConceptDetailsModal } from '../components/ConceptDetailsModal';

export default function ChapterDetail() {
  const { subject: subjectParam, chapter: chapterParam } = useParams<{
    subject: string;
    chapter: string;
  }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [constellation, setConstellation] = useState<ChapterConstellation | null>(null);
  const [loading, setLoading] = useState(true);

  // Selected concept for Popover / Bottom Sheet
  const [selectedConcept, setSelectedConcept] = useState<ConceptNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessingMastery, setIsProcessingMastery] = useState(false);
  const [recentlyMasteredId, setRecentlyMasteredId] = useState<string | undefined>();

  const [searchParams] = useSearchParams();
  const targetConceptId = searchParams.get('concept');

  const subjectId = (subjectParam || 'science').toLowerCase();
  const chapterId = (chapterParam || '').toLowerCase();

  useEffect(() => {
    async function loadData() {
      try {
        // FRONTEND BACKEND HOOK (page-level):
        // This page consumes GET /api/users/me/profile, GET /api/curriculum/subjects/:subjectId/chapters/:chapterId,
        // and the chapter constellation payload used by the learning path UI via curriculumService.getChapter()
        // and constellationService.getChapterConstellation().
        const profile = await authService.getProfile();
        setUser(profile);

        const ch = await curriculumService.getChapter(subjectId, chapterId);
        setChapter(ch);

        const chName = ch ? ch.name : chapterId.replace(/-/g, ' ');
        const constData = await constellationService.getChapterConstellation(
          subjectId,
          chapterId,
          chName
        );
        setConstellation(constData);

        // If target concept is specified via query param, automatically focus and open it
        if (targetConceptId && constData) {
          for (const topic of constData.topics) {
            const found = topic.concepts.find((c) => c.id === targetConceptId);
            if (found) {
              setSelectedConcept(found);
              setIsModalOpen(true);
              setTimeout(() => {
                const el = document.getElementById(`concept-node-${targetConceptId}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 400);
              break;
            }
          }
        }
      } catch (err) {
        console.error('Failed to load chapter constellation:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subjectId, chapterId, targetConceptId]);

  const subjectName = subjectId.charAt(0).toUpperCase() + subjectId.slice(1);
  const synchronousChapter = CHAPTER_DATABASE[subjectId]?.find((c) => c.id === chapterId);
  const chapterDisplayName =
    chapter?.name ||
    constellation?.name ||
    synchronousChapter?.name ||
    chapterId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  // Handle node tap: If node is red (unmastered available), navigate directly to video without popup
  const handleSelectConcept = (concept: ConceptNode) => {
    if (concept.status === 'locked') return;

    // For red nodes (active/unmastered), take user directly to video page
    if (concept.status !== 'mastered') {
      const lang = user?.default_language || 'hi';
      navigate(`/learn/${concept.id}?subject=${subjectId}&chapter=${chapterId}&lang=${lang}`);
      return;
    }

    // For green (mastered) nodes, open popup to review, explain or practice
    setSelectedConcept(concept);
    setIsModalOpen(true);
  };

  // When concept popup opens, auto-scroll/pan upward if node is near bottom so entire popup fits inside existing container
  useEffect(() => {
    if (isModalOpen && selectedConcept) {
      const nodeEl = document.getElementById(`concept-node-${selectedConcept.id}`);
      if (nodeEl) {
        const rect = nodeEl.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        // If node is in the lower half or near the bottom, smoothly auto-scroll upward
        if (rect.bottom > viewportHeight * 0.45) {
          nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [isModalOpen, selectedConcept]);

  // Handle concept mastery transition
  const handleMasterConcept = async (conceptId: string) => {
    setIsProcessingMastery(true);
    try {
      const updatedConstellation = await constellationService.setConceptMastered(
        subjectId,
        chapterId,
        conceptId
      );
      setConstellation(updatedConstellation);
      setRecentlyMasteredId(conceptId);

      // Find the next available unlocked node
      let nextUnlockedNode: ConceptNode | null = null;
      let foundCurrent = false;

      for (const topic of updatedConstellation.topics) {
        for (const concept of topic.concepts) {
          if (concept.id === conceptId) {
            foundCurrent = true;
            continue;
          }
          if (foundCurrent && (concept.status === 'available' || concept.status === 'requested')) {
            nextUnlockedNode = concept;
            break;
          }
        }
        if (nextUnlockedNode) break;
      }

      // Close modal smoothly
      setIsModalOpen(false);

      // Subtly animate node and smoothly scroll/pan toward the next unlocked node
      // No celebration overlay, confetti, stars, or fireworks
      setTimeout(() => {
        if (nextUnlockedNode) {
          const targetEl = document.getElementById(`concept-node-${nextUnlockedNode.id}`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 350);

      // Clear recent marker after animation
      setTimeout(() => {
        setRecentlyMasteredId(undefined);
      }, 2000);
    } catch (err) {
      console.error('Failed to master concept:', err);
    } finally {
      setIsProcessingMastery(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans overflow-x-hidden">
      {/* Top Navbar matching main page */}
      <AppNavbar user={user} />

      <main className="flex-1 w-full px-8 md:px-12 py-6 sm:py-8 pb-24 md:pb-12">
        {/* Header Section: Chapter Title and Subtitle */}
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-2">
            {chapterDisplayName}
          </h1>
          <p className="text-stone-600 text-base sm:text-lg font-medium leading-relaxed">
            Select a concept to explore and practice.
          </p>
        </div>

        {loading ? (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="h-96 bg-stone-200/40 rounded-[28px] animate-pulse" />
          </div>
        ) : !chapter && !constellation ? (
          <div className="max-w-md mx-auto bg-white rounded-[28px] border border-stone-200/80 p-10 text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Chapter Not Found</h2>
            <p className="text-xs text-stone-500 mb-4">The requested chapter could not be located.</p>
            <Link to={`/home/${subjectId}`} className="text-xs font-bold text-[#6d0e00] hover:underline">
              Return to chapters
            </Link>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            {/* Gamified Constellation Learning Path */}
            {constellation && (
              <ConstellationPath
                topics={constellation.topics}
                onSelectConcept={handleSelectConcept}
                selectedConceptId={selectedConcept?.id}
                recentlyMasteredId={recentlyMasteredId}
              />
            )}
          </div>
        )}
      </main>

      {/* Node Tap Popover (Desktop) / Bottom Sheet (Mobile) */}
      <ConceptDetailsModal
        concept={selectedConcept}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMasterConcept={handleMasterConcept}
        isProcessing={isProcessingMastery}
        onLearn={(node) => {
          setIsModalOpen(false);
          const lang = user?.default_language || 'hi';
          navigate(`/learn/${node.id}?subject=${subjectId}&chapter=${chapterId}&lang=${lang}`);
        }}
        onExplain={(node) => {
          setIsModalOpen(false);
          const lang = user?.default_language || 'hi';
          navigate(`/explain/${node.id}?subject=${subjectId}&chapter=${chapterId}&lang=${lang}`);
        }}
        onPractice={(node) => {
          setIsModalOpen(false);
          const lang = user?.default_language || 'hi';
          navigate(`/practice/${node.id}?subject=${subjectId}&chapter=${chapterId}&lang=${lang}`);
        }}
      />
    </div>
  );
}
