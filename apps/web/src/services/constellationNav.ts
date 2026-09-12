/**
 * Constellation Navigation Service
 * 
 * Handles deep-linking directly to specific concept nodes within a chapter's constellation,
 * ensuring subject, chapter, and concept context are strictly preserved.
 */

import { NavigateFunction } from 'react-router-dom';

export interface ConceptLocation {
  subjectId: string;
  chapterId: string;
  conceptId: string;
  conceptName?: string;
  chapterName?: string;
}

export const constellationNavService = {
  /**
   * Generates the URL path to a specific concept node in a constellation
   */
  getConceptUrl(subjectId: string, chapterId: string, conceptId: string): string {
    const cleanSubject = encodeURIComponent(subjectId.toLowerCase());
    const cleanChapter = encodeURIComponent(chapterId.toLowerCase());
    const cleanConcept = encodeURIComponent(conceptId);
    return `/home/${cleanSubject}/${cleanChapter}?concept=${cleanConcept}`;
  },

  /**
   * Directly navigates the user to a specific concept node in a constellation
   */
  navigateToConcept(
    navigate: NavigateFunction,
    subjectId: string,
    chapterId: string,
    conceptId: string
  ): void {
    const url = this.getConceptUrl(subjectId, chapterId, conceptId);
    navigate(url);
  },
};
