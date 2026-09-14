import { apiFetch, setToken, getToken } from "./http";
import type { Subject, Chapter } from "./curriculumData";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  profile_photo: string | null;
  class: number | null;
  default_language: string | null;
  onboarding_completed: boolean;
  created_at?: string;
  updated_at?: string;
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

export type { Subject, Chapter };

const USER_KEY = "akara_auth_user";
const LOGGED_OUT_KEY = "akara_logged_out";

function cacheUser(u: UserProfile | null) {
  try {
    if (u) {
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      localStorage.removeItem(LOGGED_OUT_KEY);
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch { /* ignore */ }
}

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setToken(data.token);
    cacheUser(data.user);
    return data;
  },

  async signup(payload: SignupPayload): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setToken(data.token);
    cacheUser(data.user);
    return data;
  },

  async googleAuth(credential: string | { idToken?: string; accessToken?: string }): Promise<AuthResponse> {
    const body =
      typeof credential === "string"
        ? { id_token: credential, provider: "google" }
        : credential.accessToken
          ? { access_token: credential.accessToken, provider: "google" }
          : { id_token: credential.idToken, provider: "google" };
    const data = await apiFetch<AuthResponse>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setToken(data.token);
    cacheUser(data.user);
    return data;
  },

  async getProfile(): Promise<UserProfile> {
    const user = await apiFetch<UserProfile>("/api/users/me/profile");
    cacheUser(user);
    return user;
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
    const user = await apiFetch<UserProfile>("/api/users/me/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    cacheUser(user);
    return user;
  },

  async uploadPhoto(file: File): Promise<UserProfile> {
    const { apiUpload } = await import("./http");
    const user = await apiUpload<UserProfile>("/api/users/me/profile/photo", file);
    cacheUser(user);
    return user;
  },

  logout() {
    setToken(null);
    cacheUser(null);
    try {
      localStorage.setItem(LOGGED_OUT_KEY, "true");
    } catch { /* ignore */ }
  },

  getToken(): string | null {
    try {
      if (localStorage.getItem(LOGGED_OUT_KEY) === "true" && !getToken()) return null;
    } catch { /* ignore */ }
    return getToken();
  },

  getCurrentUser(): UserProfile | null {
    try {
      if (localStorage.getItem(LOGGED_OUT_KEY) === "true") return null;
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as UserProfile) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },

  getDraftClass(): number | null {
    try {
      const cached = this.getCurrentUser()?.class;
      if (cached) return cached;
      const raw = localStorage.getItem("akara_draft_class");
      return raw ? Number(raw) : null;
    } catch {
      return this.getCurrentUser()?.class ?? null;
    }
  },

  setDraftClass(cls: number | null) {
    try {
      if (cls == null) localStorage.removeItem("akara_draft_class");
      else localStorage.setItem("akara_draft_class", String(cls));
    } catch { /* ignore */ }
  },

  getDraftLanguage(): string {
    try {
      return (
        localStorage.getItem("akara_draft_lang") ||
        this.getCurrentUser()?.default_language ||
        "hi"
      );
    } catch {
      return this.getCurrentUser()?.default_language ?? "hi";
    }
  },

  setDraftLanguage(lang: string) {
    try {
      localStorage.setItem("akara_draft_lang", lang);
    } catch { /* ignore */ }
  },
};

export const curriculumService = {
  async getSubjects(userClass: number): Promise<Subject[]> {
    const data = await apiFetch<{ class: number; subjects: Subject[] }>(
      `/api/curriculum/subjects?class=${userClass}`
    );
    return data.subjects ?? [];
  },

  async getChapters(subjectId: string, userClass?: number): Promise<Chapter[]> {
    const q = userClass ? `?class=${userClass}` : "";
    const data = await apiFetch<{ chapters: Chapter[] }>(
      `/api/curriculum/subjects/${encodeURIComponent(subjectId)}/chapters${q}`
    );
    return data.chapters ?? [];
  },

  async getChapter(subjectId: string, chapterId: string): Promise<Chapter | null> {
    try {
      const data = await apiFetch<Chapter>(
        `/api/curriculum/subjects/${encodeURIComponent(subjectId)}/chapters/${encodeURIComponent(chapterId)}`
      );
      return data;
    } catch {
      return null;
    }
  },
};
