/**
 * Profile Preferences & Offline Storage Service
 * 
 * Manages:
 * 1. Personalization Interests (used as context inputs in explanation generation)
 * 2. Data Saver Preference (prefers audio/lightweight content on mobile data)
 * 3. Offline / Downloaded Chapters catalog & storage management
 */

export interface DownloadedChapter {
  id: string;
  chapterId: string;
  chapterName: string;
  subjectId: string;
  subjectName: string;
  class: number;
  sizeMb: number;
  downloadedAt: string;
  conceptCount: number;
}

const STORAGE_KEY_INTERESTS = 'akara_student_interests';
const STORAGE_KEY_DATA_SAVER = 'akara_data_saver_preference';
const STORAGE_KEY_DOWNLOADS = 'akara_offline_chapters';

const DEFAULT_INTERESTS = ['Cricket', 'Farming', 'Bollywood', 'Gaming'];

const INITIAL_DOWNLOADED_CHAPTERS: DownloadedChapter[] = [
  {
    id: 'dl-01',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    subjectId: 'science',
    subjectName: 'Science',
    class: 10,
    sizeMb: 24.6,
    downloadedAt: '2026-09-08',
    conceptCount: 7,
  },
  {
    id: 'dl-02',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    subjectId: 'maths',
    subjectName: 'Maths',
    class: 10,
    sizeMb: 18.2,
    downloadedAt: '2026-09-10',
    conceptCount: 6,
  },
];

export const profilePreferencesService = {
  /**
   * --- 1. Interests Management ---
   */
  async getInterests(): Promise<string[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/users/me/interests.
    // The current data is hardcoded/localStorage-backed and should be replaced by the authenticated
    // user's personalization interests returned by the backend.
    try {
      const raw = localStorage.getItem(STORAGE_KEY_INTERESTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      localStorage.setItem(STORAGE_KEY_INTERESTS, JSON.stringify(DEFAULT_INTERESTS));
      return DEFAULT_INTERESTS;
    } catch {
      return DEFAULT_INTERESTS;
    }
  },

  async addInterest(interest: string): Promise<string[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by PUT /api/users/me/interests.
    // The current localStorage update is a temporary mock; backend should persist the updated interest list.
    const current = await this.getInterests();
    const clean = interest.trim();
    if (!clean) return current;

    // Check if already present (case-insensitive)
    const exists = current.some((item) => item.toLowerCase() === clean.toLowerCase());
    if (exists) return current;

    const updated = [...current, clean];
    try {
      localStorage.setItem(STORAGE_KEY_INTERESTS, JSON.stringify(updated));
    } catch {
      // ignore
    }
    return updated;
  },

  async removeInterest(interest: string): Promise<string[]> {
    const current = await this.getInterests();
    const updated = current.filter(
      (item) => item.toLowerCase() !== interest.trim().toLowerCase()
    );
    try {
      localStorage.setItem(STORAGE_KEY_INTERESTS, JSON.stringify(updated));
    } catch {
      // ignore
    }
    return updated;
  },

  /**
   * --- 2. Data Saver Preference ---
   */
  getDataSaver(): boolean {
    try {
      const val = localStorage.getItem(STORAGE_KEY_DATA_SAVER);
      return val === 'true';
    } catch {
      return false;
    }
  },

  async setDataSaver(enabled: boolean): Promise<boolean> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by PATCH /api/users/me/preferences.
    // The current implementation stores the data saver toggle locally; backend should persist and return it.
    try {
      localStorage.setItem(STORAGE_KEY_DATA_SAVER, enabled ? 'true' : 'false');
    } catch {
      // ignore
    }
    return enabled;
  },

  /**
   * --- 3. Offline / Downloaded Chapters ---
   */
  async getDownloadedChapters(): Promise<DownloadedChapter[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/users/me/offline-chapters.
    // The current list is a mock offline catalog stored in localStorage and should be served by backend.
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DOWNLOADS);
      if (raw) {
        return JSON.parse(raw);
      }
      localStorage.setItem(STORAGE_KEY_DOWNLOADS, JSON.stringify(INITIAL_DOWNLOADED_CHAPTERS));
      return INITIAL_DOWNLOADED_CHAPTERS;
    } catch {
      return INITIAL_DOWNLOADED_CHAPTERS;
    }
  },

  async removeDownloadedChapter(id: string): Promise<DownloadedChapter[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by DELETE /api/users/me/offline-chapters/:id.
    // The current removal logic is local mock state only; backend should remove the stored chapter entry.
    const list = await this.getDownloadedChapters();
    const updated = list.filter((ch) => ch.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY_DOWNLOADS, JSON.stringify(updated));
    } catch {
      // ignore
    }
    return updated;
  },

  async clearAllDownloads(): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY_DOWNLOADS, JSON.stringify([]));
    } catch {
      // ignore
    }
  },
};
