import React from 'react';

// Color palette: Bold, vibrant, modern solid colors (Strictly NO RED)
// High contrast with white text and clean readability
export const VIBRANT_CARD_COLORS = [
  'bg-[#254CE8]', // Bold Royal Blue
  'bg-[#0B7D58]', // Emerald Green
  'bg-[#6C34E8]', // Rich Indigo / Deep Violet
  'bg-[#D97706]', // Warm Amber / Ochre Gold
  'bg-[#0284C7]', // Bright Sky Blue
  'bg-[#0D9488]', // Deep Teal
  'bg-[#4F46E5]', // Deep Periwinkle Blue
  'bg-[#059669]', // Vibrant Jade Green
  'bg-[#7C3AED]', // Purple
  'bg-[#EA580C]', // Bright Rust Orange (NOT red)
];

// Fixed distinctive colors for homepage subjects (NO RED)
export const HOMEPAGE_SUBJECT_COLORS: Record<string, string> = {
  science: 'bg-[#0B7D58]', // Emerald Green for Science
  maths: 'bg-[#254CE8]',   // Royal Blue for Maths
  physics: 'bg-[#5B34C8]', // Rich Violet Purple for Physics
  chemistry: 'bg-[#0D9488]', // Deep Teal for Chemistry
  biology: 'bg-[#15803D]',   // Forest / Jade Green for Biology
};

export const DEFAULT_HOMEPAGE_COLOR = 'bg-[#254CE8]';

// Distinct colorful backgrounds for each chapter to make the chapter page colorful
export function getChapterBgColor(chapterNum: number): string {
  const index = (chapterNum - 1) % VIBRANT_CARD_COLORS.length;
  return VIBRANT_CARD_COLORS[index];
}

// Subject primary image mapping for homepage
export function getSubjectImage(subjectId: string): string {
  const sid = subjectId.toLowerCase();
  switch (sid) {
    case 'science':
      return '/science1.png';
    case 'maths':
      return '/maths1.png';
    case 'physics':
      return '/physics1.png';
    case 'chemistry':
      return '/chem1.png';
    case 'biology':
      return '/science2.png';
    default:
      return '/science1.png';
  }
}

// Chapter image mapping cycling through available subject-specific assets
export function getChapterImage(subjectId: string, chapterNum: number): string {
  const sid = subjectId.toLowerCase();
  if (sid === 'maths') {
    const images = ['/maths1.png', '/maths2.png', '/maths3.png'];
    return images[(chapterNum - 1) % images.length];
  }
  if (sid === 'physics') {
    const images = ['/physics1.png', '/physics2.png', '/physics3.png'];
    return images[(chapterNum - 1) % images.length];
  }
  if (sid === 'chemistry') {
    const images = ['/chem1.png', '/chem2.png', '/chem3.png'];
    return images[(chapterNum - 1) % images.length];
  }
  if (sid === 'science') {
    // Science chapters in class 10 are a mix of Chem, Bio, and Physics
    // Ch 1-4: Chemistry -> chem1, chem2, chem3, chem1
    // Ch 5-8: Biology -> science1, science2
    // Ch 9-12: Physics -> physics1, physics2, physics3
    if (chapterNum <= 4) {
      const chemImages = ['/chem1.png', '/chem2.png', '/chem3.png'];
      return chemImages[(chapterNum - 1) % chemImages.length];
    } else if (chapterNum <= 8) {
      const bioImages = ['/science1.png', '/science2.png'];
      return bioImages[(chapterNum - 5) % bioImages.length];
    } else {
      const physImages = ['/physics1.png', '/physics2.png', '/physics3.png'];
      return physImages[(chapterNum - 9) % physImages.length];
    }
  }
  // Default fallback
  const fallback = ['/science1.png', '/science2.png'];
  return fallback[(chapterNum - 1) % fallback.length];
}

/**
 * Gracefully handle missing or moved static images without broken image icons
 * or ugly external placeholder fallbacks.
 * Automatically checks root '/' or '/extras/' locations before gracefully hiding.
 */
export function handleImageFallback(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  secondaryFallback?: string
) {
  const target = e.currentTarget;
  const currentSrc = target.getAttribute('src') || target.src;
  
  if (currentSrc.includes('placehold.co')) return;

  // If failed with root path, try /extras/
  if (!currentSrc.includes('/extras/')) {
    const filename = currentSrc.split('/').pop()?.split('?')[0];
    if (filename) {
      target.src = `/extras/${filename}`;
      return;
    }
  }

  // If secondary fallback specified and not tried yet, try it
  if (secondaryFallback && !currentSrc.includes(secondaryFallback)) {
    target.src = secondaryFallback;
    return;
  }

  // Otherwise fallback to placehold.co
  target.src = 'https://placehold.co/600x400?text=Image+Not+Found';
}
