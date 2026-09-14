import { apiFetch } from "./http";

export type TouchedConceptStatus = "mastered" | "available" | "needs-revisit";

export interface TouchedConcept {
  id: string;
  name: string;
  shortDescription: string;
  status: TouchedConceptStatus;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  topicName: string;
  lastActivityDate?: string;
  diagnosticInsight?: string;
}

export interface SubjectProgressGroup {
  subjectId: string;
  subjectName: string;
  masteredCount: number;
  revisitCount: number;
  availableCount: number;
  concepts: TouchedConcept[];
}

export interface StudentProgressSummary {
  conceptsMastered: number;
  conceptsToRevisit: number;
  activeDaysThisWeek: number;
}

interface BackendSummary {
  concepts_mastered: number;
  concepts_to_revisit: number;
  active_days_this_week: number;
}

interface BackendConcept {
  id: string;
  name: string;
  short_description: string;
  status: string;
  chapter_id: string;
  chapter_name: string;
  topic_name: string;
  last_session_at?: string | null;
}

interface BackendGroup {
  subject_id: string;
  subject_name: string;
  mastered_count: number;
  revisit_count: number;
  available_count: number;
  concepts: BackendConcept[];
}

export const progressService = {
  logActivity(): void {
    apiFetch("/api/activity/heartbeat", {
      method: "POST",
      body: JSON.stringify({ minutes: 1 }),
    }).catch(() => { /* offline-safe */ });
  },

  async getProgressSummary(): Promise<StudentProgressSummary> {
    const data = await apiFetch<BackendSummary>("/api/progress/summary");
    return {
      conceptsMastered: data.concepts_mastered ?? 0,
      conceptsToRevisit: data.concepts_to_revisit ?? 0,
      activeDaysThisWeek: data.active_days_this_week ?? 0,
    };
  },

  async getTouchedConceptsBySubject(): Promise<SubjectProgressGroup[]> {
    const data = await apiFetch<{ subjects: BackendGroup[] }>("/api/progress/learning-map");
    return (data.subjects ?? []).map((g) => ({
      subjectId: g.subject_id,
      subjectName: g.subject_name,
      masteredCount: g.mastered_count ?? 0,
      revisitCount: g.revisit_count ?? 0,
      availableCount: g.available_count ?? 0,
      concepts: (g.concepts ?? [])
        .filter((c) => c.status === "mastered" || c.status === "available" || c.status === "needs-revisit")
        .map((c) => ({
          id: c.id,
          name: c.name,
          shortDescription: c.short_description ?? "",
          status: c.status as TouchedConceptStatus,
          subjectId: g.subject_id,
          subjectName: g.subject_name,
          chapterId: c.chapter_id,
          chapterName: c.chapter_name,
          topicName: c.topic_name,
          lastActivityDate: c.last_session_at ?? undefined,
        })),
    }));
  },
};
