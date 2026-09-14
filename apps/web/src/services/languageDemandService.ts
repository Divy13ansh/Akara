import { apiFetch } from "./http";

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
  status: "queued" | "processing" | "completed";
}

export const languageDemandService = {
  async getDemandForLanguage(languageName: string): Promise<number> {
    const list = await this.getTopDemandedLanguages(100);
    const found = list.find((d) => d.language.toLowerCase() === languageName.trim().toLowerCase());
    return found?.requestedCount ?? 0;
  },

  hasUserRequested(_languageName: string): boolean {
    return false;
  },

  async requestLanguage(languageInput: string): Promise<LanguageRequestResult> {
    const trimmed = languageInput.trim();
    if (!trimmed) {
      return { success: false, message: "Please enter a language name.", updatedCount: 0, ticketId: "", alreadyRequested: false };
    }
    const data = await apiFetch<{
      success: boolean;
      message: string;
      updatedCount?: number;
      updatedCount2?: number;
      ticketId?: string;
      ticket_id?: string;
      alreadyRequested?: boolean;
      already_requested?: boolean;
    }>("/api/languages/request", {
      method: "POST",
      body: JSON.stringify({ language: trimmed }),
    });
    return {
      success: data.success,
      message: data.message,
      updatedCount: (data as { updatedCount?: number }).updatedCount ?? (data as { updated_count?: number }).updated_count ?? 0,
      ticketId: data.ticketId ?? data.ticket_id ?? "",
      alreadyRequested: data.alreadyRequested ?? data.already_requested ?? !data.success,
    };
  },

  async getTopDemandedLanguages(limit = 6): Promise<LanguageDemandRecord[]> {
    const data = await apiFetch<{ demands: Array<{ language: string; nativeScript?: string; native_script?: string; requestedCount?: number; requested_count?: number }> }>(
      "/api/languages/demand"
    );
    return (data.demands ?? [])
      .map((d) => ({
        language: d.language,
        nativeScript: d.nativeScript ?? d.native_script,
        requestedCount: d.requestedCount ?? d.requested_count ?? 0,
      }))
      .sort((a, b) => b.requestedCount - a.requestedCount)
      .slice(0, limit);
  },
};
