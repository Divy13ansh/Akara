/**
 * Frontend API Service Layer
 * 
 * This file serves as the clean abstraction layer between the UI and the backend.
 * Full API specifications are documented in /backend-endpoints.md.
 * 
 * TODO: Replace mock handlers with real fetch/axios calls to backend endpoints
 * once the backend services are provisioned.
 */

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  profile_photo: string | null;
  class: number | null;
  default_language: string | null;
  onboarding_completed: boolean;
  joined_date?: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
}

export interface UpdateProfilePayload {
  class?: number;
  default_language?: string;
  name?: string;
  profile_photo?: string;
}

import { Subject, Chapter, getSubjectsForClass, CHAPTER_DATABASE } from './curriculumData';

export type { Subject, Chapter };

// In-memory token and mock user storage with localStorage sync
const STORAGE_KEY_USER = 'akara_auth_user';
const STORAGE_KEY_TOKEN = 'akara_auth_token';
const STORAGE_KEY_LOGGED_OUT = 'akara_logged_out';

function getStoredUser(): UserProfile | null {
  try {
    if (localStorage.getItem(STORAGE_KEY_LOGGED_OUT) === 'true') {
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.joined_date) {
        parsed.joined_date = '2026-07-01';
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(parsed));
      }
      return parsed;
    }
    
    // Default initial student profile for preview convenience
    const defaultUser: UserProfile = {
      id: 'usr_student_10',
      name: 'Poorvika',
      email: 'poorvika@akara.edu',
      profile_photo: null,
      class: 10,
      default_language: 'hi',
      onboarding_completed: true,
      joined_date: '2026-07-01',
    };
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(defaultUser));
    return defaultUser;
  } catch {
    return null;
  }
}

function getStoredToken(): string | null {
  try {
    if (localStorage.getItem(STORAGE_KEY_LOGGED_OUT) === 'true') {
      return null;
    }
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    return token || 'mock_jwt_token_initial';
  } catch {
    return null;
  }
}

function saveStoredAuth(user: UserProfile | null, token: string | null) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      localStorage.removeItem(STORAGE_KEY_LOGGED_OUT);
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
    if (token) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      localStorage.removeItem(STORAGE_KEY_LOGGED_OUT);
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  } catch {
    // Ignore storage quota errors
  }
}

let authToken: string | null = getStoredToken();
let currentUser: UserProfile | null = getStoredUser();
let draftClass: number | null = null;
let draftLanguage: string | null = 'hi';

export const authService = {
  /**
   * POST /api/auth/login
   * Manual email/password login
   */
  async login(payload: LoginPayload): Promise<AuthResponse> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by POST /api/auth/login.
    // Current implementation is a mock response; the real app should send the email/password payload
    // to the backend and store the returned token + user profile in local state.
    // const res = await fetch('/api/auth/login', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload),
    // });
    // if (!res.ok) throw new Error(await res.text());
    // const data = await res.json();
    // authToken = data.token;
    // return data;

    // Simulated mock response:
    await new Promise((resolve) => setTimeout(resolve, 300));
    currentUser = {
      id: 'mock_usr_' + Math.random().toString(36).substring(7),
      name: payload.email.split('@')[0] || 'Aqsara Student',
      email: payload.email,
      profile_photo: null,
      class: 10,
      default_language: 'hi',
      onboarding_completed: true,
    };
    authToken = 'mock_jwt_token';
    saveStoredAuth(currentUser, authToken);
    return { token: authToken, user: currentUser };
  },

  /**
   * POST /api/auth/signup
   * Manual registration with name, email, and password
   */
  async signup(payload: SignupPayload): Promise<AuthResponse> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by POST /api/auth/signup.
    // Current logic is mocked and uses a hardcoded generated user profile; backend should return
    // the auth token and onboarding state here after registration.
    // const res = await fetch('/api/auth/signup', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload),
    // });
    // if (!res.ok) throw new Error(await res.text());
    // const data = await res.json();
    // authToken = data.token;
    // return data;

    // Simulated mock response:
    await new Promise((resolve) => setTimeout(resolve, 300));
    currentUser = {
      id: 'mock_usr_' + Math.random().toString(36).substring(7),
      name: payload.name,
      email: payload.email,
      profile_photo: null,
      class: null,
      default_language: null,
      onboarding_completed: false,
    };
    authToken = 'mock_jwt_token';
    saveStoredAuth(currentUser, authToken);
    return { token: authToken, user: currentUser };
  },

  /**
   * GET/POST /api/auth/google
   * Unified Google OAuth sign-in/sign-up
   */
  async googleAuth(credential?: string): Promise<AuthResponse> {
    // BACKEND WIRED (GIS id_token flow): exchange the Google credential for a
    // JWT + profile. Falls back to the mock when no credential is provided.
    if (credential) {
      const base = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE || '';
      const res = await fetch(`${base}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: credential, provider: 'google' }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      authToken = data.token;
      currentUser = data.user;
      saveStoredAuth(currentUser, authToken);
      return data;
    }

    // Simulated mock response (legacy — no credential provided):
    await new Promise((resolve) => setTimeout(resolve, 300));
    currentUser = {
      id: 'mock_google_usr_' + Math.random().toString(36).substring(7),
      name: 'Google Scholar',
      email: 'student@example.com',
      profile_photo: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      class: null,
      default_language: null,
      onboarding_completed: false,
    };
    authToken = 'mock_google_token';
    saveStoredAuth(currentUser, authToken);
    return { token: authToken, user: currentUser };
  },

  /**
   * GET /api/users/me/profile
   * Fetch authenticated user's profile and class
   */
  async getProfile(): Promise<UserProfile> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/users/me/profile.
    // The response currently comes from in-memory/localStorage mock data, but the real frontend
    // should fetch the authenticated user's class, default language, and onboarding completion here.
    // const res = await fetch('/api/users/me/profile', {
    //   headers: { Authorization: `Bearer ${authToken}` },
    // });
    // if (!res.ok) throw new Error(await res.text());
    // return await res.json();

    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!currentUser) {
      currentUser = getStoredUser();
    }
    if (!currentUser) {
      throw new Error('Unauthenticated user');
    }
    return currentUser;
  },

  isAuthenticated(): boolean {
    return !!(currentUser || getStoredUser());
  },

  /**
   * PATCH /api/users/me/profile
   * Save onboarding selections (class, default_language) or profile changes
   */
  async updateProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by PATCH /api/users/me/profile.
    // The current code mutates the local mock user immediately; backend should persist class,
    // default_language, and onboarding completion here and return the updated profile.
    // const res = await fetch('/api/users/me/profile', {
    //   method: 'PATCH',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     Authorization: `Bearer ${authToken}`,
    //   },
    //   body: JSON.stringify(payload),
    // });
    // if (!res.ok) throw new Error(await res.text());
    // return await res.json();

    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!currentUser) {
      currentUser = {
        id: 'mock_usr_guest',
        name: 'Aqsara Student',
        email: 'student@aqsara.org',
        profile_photo: null,
        class: null,
        default_language: null,
        onboarding_completed: false,
      };
    }

    const updatedClass = payload.class ?? currentUser.class;
    const updatedLang = payload.default_language ?? currentUser.default_language;
    const isCompleted = updatedClass !== null && updatedLang !== null && updatedLang !== '';

    currentUser = {
      ...currentUser,
      ...payload,
      class: updatedClass,
      default_language: updatedLang,
      onboarding_completed: isCompleted,
    };

    saveStoredAuth(currentUser, authToken);
    return currentUser;
  },

  /**
   * Sign out (client-side token cleanup)
   */
  logout() {
    authToken = null;
    currentUser = null;
    saveStoredAuth(null, null);
    try {
      localStorage.setItem(STORAGE_KEY_LOGGED_OUT, 'true');
    } catch {
      // ignore
    }
  },

  getToken(): string | null {
    return authToken;
  },

  getCurrentUser(): UserProfile | null {
    return currentUser;
  },

  getDraftClass(): number | null {
    return draftClass ?? currentUser?.class ?? null;
  },

  setDraftClass(cls: number | null) {
    draftClass = cls;
  },

  getDraftLanguage(): string {
    return draftLanguage ?? currentUser?.default_language ?? 'hi';
  },

  setDraftLanguage(lang: string) {
    draftLanguage = lang;
  }
};

export const curriculumService = {
  /**
   * GET /api/curriculum/subjects?class={class}
   * Fetch subjects appropriate to the user's class
   * - Classes 6–10: Science, Maths
   * - Classes 11–12: Physics, Chemistry, Biology, Maths
   * Strict rule: Do NOT show Science for classes 11–12.
   */
  async getSubjects(userClass: number): Promise<Subject[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/curriculum/subjects?class={userClass}.
    // The current response is hardcoded from getSubjectsForClass(userClass) in curriculumData.ts.
    await new Promise((resolve) => setTimeout(resolve, 150));
    return getSubjectsForClass(userClass);
  },

  /**
   * GET /api/curriculum/subjects/:subjectId/chapters
   * Fetch simple vertical list of chapters for a selected subject, including mastery progress
   * Each chapter contains: name, progress ring, mastered_concepts / total_concepts
   */
  async getChapters(subjectId: string, userClass?: number): Promise<Chapter[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/curriculum/subjects/:subjectId/chapters.
    // The current chapter list is hardcoded from CHAPTER_DATABASE and should come from backend
    // with mastery counts per chapter for the authenticated student.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const list = CHAPTER_DATABASE[subjectId.toLowerCase()] || [];
    return list;
  },

  /**
   * GET /api/curriculum/subjects/:subjectId/chapters/:chapterId
   * Fetch single chapter details
   */
  async getChapter(subjectId: string, chapterId: string): Promise<Chapter | null> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/curriculum/subjects/:subjectId/chapters/:chapterId.
    // The current result is pulled from the hardcoded CHAPTER_DATABASE mock; backend should return
    // the full chapter payload, including chosen concepts and concept statuses.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const list = CHAPTER_DATABASE[subjectId.toLowerCase()] || [];
    return list.find((c) => c.id === chapterId) || null;
  }
};

