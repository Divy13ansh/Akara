/**
 * Language Demand & Batch Generation Service
 * 
 * Manages live community demand signals for un-supported regional Indian languages.
 * Tracks student demand counts per language and queues new language requests into
 * the background batch-generation queue.
 */

export interface LanguageDemandRecord {
  language: string;
  nativeScript?: string;
  requestedCount: number;
}

export interface LanguageRequestResult {
  success: boolean;
  message: string;
  updatedCount: number;
  ticketId: string;
  alreadyRequested: boolean;
}

export interface BatchQueueItem {
  ticketId: string;
  language: string;
  requestedAt: string;
  status: 'queued' | 'processing' | 'completed';
}

const STORAGE_KEY_DEMAND = 'akara_language_demand_data';
const STORAGE_KEY_USER_REQUESTS = 'akara_user_requested_languages';
const STORAGE_KEY_BATCH_QUEUE = 'akara_batch_generation_queue';

// Initial realistic community demand signals for un-supported Indian regional languages
const INITIAL_DEMAND_DATA: LanguageDemandRecord[] = [
  { language: 'Maithili', nativeScript: 'मैथिली', requestedCount: 348 },
  { language: 'Bhojpuri', nativeScript: 'भोजपुरी', requestedCount: 512 },
  { language: 'Marwari', nativeScript: 'मारवाड़ी', requestedCount: 231 },
  { language: 'Santali', nativeScript: 'संताली', requestedCount: 164 },
  { language: 'Konkani', nativeScript: 'कोंकणी', requestedCount: 187 },
  { language: 'Dogri', nativeScript: 'डोगरी', requestedCount: 124 },
  { language: 'Kashmiri', nativeScript: 'कॉशुर', requestedCount: 209 },
  { language: 'Garhwali', nativeScript: 'गढ़वाली', requestedCount: 145 },
  { language: 'Chhattisgarhi', nativeScript: 'छत्तीसगढ़ी', requestedCount: 278 },
  { language: 'Sindhi', nativeScript: 'सिन्धी', requestedCount: 92 },
  { language: 'Bodo', nativeScript: 'बर’', requestedCount: 115 },
  { language: 'Kumaoni', nativeScript: 'कुमाऊँनी', requestedCount: 88 },
];

function getStoredDemandMap(): Map<string, LanguageDemandRecord> {
  const map = new Map<string, LanguageDemandRecord>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEMAND);
    const list: LanguageDemandRecord[] = raw ? JSON.parse(raw) : INITIAL_DEMAND_DATA;
    list.forEach((item) => map.set(item.language.toLowerCase(), item));
  } catch {
    INITIAL_DEMAND_DATA.forEach((item) => map.set(item.language.toLowerCase(), item));
  }
  return map;
}

function saveStoredDemand(map: Map<string, LanguageDemandRecord>) {
  try {
    const arr = Array.from(map.values());
    localStorage.setItem(STORAGE_KEY_DEMAND, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

function getStoredUserRequests(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_REQUESTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserRequest(languageName: string) {
  try {
    const current = getStoredUserRequests();
    const clean = languageName.trim().toLowerCase();
    if (!current.includes(clean)) {
      current.push(clean);
      localStorage.setItem(STORAGE_KEY_USER_REQUESTS, JSON.stringify(current));
    }
  } catch {
    // ignore
  }
}

function addToBatchQueue(languageName: string): string {
  const ticketId = 'BATCH-LANG-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BATCH_QUEUE);
    const queue: BatchQueueItem[] = raw ? JSON.parse(raw) : [];
    queue.push({
      ticketId,
      language: languageName,
      requestedAt: new Date().toISOString(),
      status: 'queued',
    });
    localStorage.setItem(STORAGE_KEY_BATCH_QUEUE, JSON.stringify(queue));
  } catch {
    // ignore
  }
  return ticketId;
}

export const languageDemandService = {
  /**
   * Fetches the current live demand count for any language name (case-insensitive)
   */
  getDemandForLanguage(languageName: string): number {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/languages/demand.
    // The current demand totals are in-memory/localStorage mock data and should be returned from backend.
    const clean = languageName.trim().toLowerCase();
    if (!clean) return 0;
    const map = getStoredDemandMap();
    const existing = map.get(clean);
    return existing ? existing.requestedCount : 0;
  },

  /**
   * Returns whether the current student has already submitted a request for this language
   */
  hasUserRequested(languageName: string): boolean {
    const clean = languageName.trim().toLowerCase();
    if (!clean) return false;
    const userReqs = getStoredUserRequests();
    return userReqs.includes(clean);
  },

  /**
   * Submits a student language request.
   * Increments real backend-style demand signals and enqueues to the batch-generation queue.
   * Prevents duplicates per student.
   */
  async requestLanguage(languageInput: string): Promise<LanguageRequestResult> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by POST /api/languages/request.
    // The current method updates mock demand counters and queues a local fake batch item; backend should
    // persist the request, increment demand, and return the queue ticket result.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const trimmed = languageInput.trim();
    if (!trimmed) {
      return {
        success: false,
        message: 'Please enter a language name.',
        updatedCount: 0,
        ticketId: '',
        alreadyRequested: false,
      };
    }

    const clean = trimmed.toLowerCase();
    const userReqs = getStoredUserRequests();

    if (userReqs.includes(clean)) {
      const map = getStoredDemandMap();
      const count = map.get(clean)?.requestedCount || 1;
      return {
        success: false,
        message: `You have already requested ${trimmed} this month.`,
        updatedCount: count,
        ticketId: '',
        alreadyRequested: true,
      };
    }

    // Update demand map
    const map = getStoredDemandMap();
    let currentRecord = map.get(clean);
    let newCount: number;

    if (currentRecord) {
      newCount = currentRecord.requestedCount + 1;
      currentRecord.requestedCount = newCount;
    } else {
      newCount = 1;
      // Capitalize first letter properly
      const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      currentRecord = {
        language: capitalized,
        requestedCount: newCount,
      };
      map.set(clean, currentRecord);
    }

    saveStoredDemand(map);
    saveUserRequest(trimmed);
    const ticketId = addToBatchQueue(currentRecord.language);

    return {
      success: true,
      message: `${currentRecord.language} request received and added to batch generation queue.`,
      updatedCount: newCount,
      ticketId,
      alreadyRequested: false,
    };
  },

  /**
   * Gets list of top requested languages for discovery or hints
   */
  async getTopDemandedLanguages(limit: number = 6): Promise<LanguageDemandRecord[]> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const map = getStoredDemandMap();
    const list = Array.from(map.values());
    return list.sort((a, b) => b.requestedCount - a.requestedCount).slice(0, limit);
  },
};
