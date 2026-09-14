import { apiFetch } from "./http";

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

export const profilePreferencesService = {
  async getInterests(): Promise<string[]> {
    const data = await apiFetch<{ interests: string[] }>("/api/users/me/interests");
    return data.interests ?? [];
  },

  async setInterests(interests: string[]): Promise<string[]> {
    const data = await apiFetch<{ success: boolean; interests: string[] }>("/api/users/me/interests", {
      method: "PUT",
      body: JSON.stringify({ interests }),
    });
    return data.interests ?? interests;
  },

  async addInterest(interest: string): Promise<string[]> {
    const clean = interest.trim();
    if (!clean) return this.getInterests();
    const current = await this.getInterests();
    if (current.some((i) => i.toLowerCase() === clean.toLowerCase())) return current;
    return this.setInterests([...current, clean].slice(0, 30));
  },

  async removeInterest(interest: string): Promise<string[]> {
    const current = await this.getInterests();
    const updated = current.filter((i) => i.toLowerCase() !== interest.trim().toLowerCase());
    return this.setInterests(updated);
  },

  async getDataSaver(): Promise<boolean> {
    const data = await apiFetch<{ data_saver_mode: boolean }>("/api/users/me/preferences");
    return data.data_saver_mode ?? false;
  },

  getDataSaverSync(): boolean {
    return false;
  },

  async setDataSaver(enabled: boolean): Promise<boolean> {
    const data = await apiFetch<{ data_saver_mode: boolean }>("/api/users/me/preferences", {
      method: "PATCH",
      body: JSON.stringify({ data_saver_mode: enabled }),
    });
    return data.data_saver_mode ?? enabled;
  },

  async getDownloadedChapters(): Promise<DownloadedChapter[]> {
    const data = await apiFetch<{ downloaded_chapters: DownloadedChapter[] }>(
      "/api/users/me/offline-chapters"
    );
    return data.downloaded_chapters ?? [];
  },

  async registerDownloadedChapter(chapterId: string, lang: string): Promise<void> {
    await apiFetch("/api/users/me/offline-chapters", {
      method: "POST",
      body: JSON.stringify({ chapter_id: chapterId, lang }),
    });
  },

  async removeDownloadedChapter(id: string): Promise<DownloadedChapter[]> {
    await apiFetch(`/api/users/me/offline-chapters/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return this.getDownloadedChapters();
  },

  async clearAllDownloads(): Promise<void> {
    const list = await this.getDownloadedChapters();
    for (const ch of list) {
      await apiFetch(`/api/users/me/offline-chapters/${encodeURIComponent(ch.id)}`, {
        method: "DELETE",
      }).catch(() => { /* continue */ });
    }
  },
};
