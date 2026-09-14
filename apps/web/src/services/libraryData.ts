import { apiFetch } from "./http";

export type MasteryProgressState = "mastered" | "needs-revisit" | "available" | "locked";

export interface LibraryConcept {
  id: string;
  name: string;
  shortDescription: string;
  subjectId: string;
  subjectName: string;
  domain: string;
  chapterId: string;
  chapterName: string;
  topicName: string;
  class: number;
  order: number;
  availableLanguages: string[];
  languageCount: number;
  totalGeneratedVideos: number;
  videoDurationMinutes: number;
  studentProgress: MasteryProgressState;
  diagnosticInsight?: string;
  prerequisiteId?: string | null;
  prerequisiteName?: string;
}

export interface LibraryRepositorySummary {
  totalGeneratedVideos: number;
  totalConcepts: number;
  totalLanguagesSupported: number;
  averageLanguagesPerConcept: number;
  coverageTiers: {
    full: number;
    high: number;
    moderate: number;
    low: number;
  };
}

export interface DomainGroup {
  domainName: string;
  subjectId: string;
  subjectName: string;
  concepts: LibraryConcept[];
}

export interface SubjectSection {
  subjectId: string;
  subjectName: string;
  totalConcepts: number;
  domains: DomainGroup[];
}

interface BackendConcept {
  id: string;
  name: string;
  short_description: string;
  subject_id: string;
  subject_name: string;
  domain: string;
  chapter_id: string;
  chapter_name: string;
  topic_name: string;
  class: number;
  order: number;
  availableLanguages?: string[];
  available_languages?: string[];
  languageCount?: number;
  language_count?: number;
  totalGeneratedVideos?: number;
  total_generated_videos?: number;
  videoDurationMinutes?: number;
  video_duration_minutes?: number;
  studentProgress?: MasteryProgressState;
  student_progress?: string;
  prerequisiteId?: string | null;
  prerequisite_id?: string | null;
}

function mapConcept(c: BackendConcept): LibraryConcept {
  const langs = c.availableLanguages ?? c.available_languages ?? [];
  const rawStatus = (c.studentProgress ?? c.student_progress ?? "locked") as string;
  const status: MasteryProgressState =
    rawStatus === "mastered" || rawStatus === "needs-revisit" || rawStatus === "available"
      ? rawStatus
      : "locked";
  return {
    id: c.id,
    name: c.name,
    shortDescription: c.short_description ?? "",
    subjectId: c.subject_id,
    subjectName: c.subject_name,
    domain: c.domain ?? "",
    chapterId: c.chapter_id,
    chapterName: c.chapter_name,
    topicName: c.topic_name ?? "",
    class: c.class ?? 10,
    order: c.order ?? 0,
    availableLanguages: langs,
    languageCount: c.languageCount ?? c.language_count ?? langs.length,
    totalGeneratedVideos: c.totalGeneratedVideos ?? c.total_generated_videos ?? langs.length,
    videoDurationMinutes: c.videoDurationMinutes ?? c.video_duration_minutes ?? 12,
    studentProgress: status,
    prerequisiteId: c.prerequisiteId ?? c.prerequisite_id ?? null,
  };
}

export const libraryRepositoryService = {
  async getConcepts(query?: string, subjectFilter?: string): Promise<LibraryConcept[]> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (subjectFilter && subjectFilter !== "all") params.set("subject", subjectFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const data = await apiFetch<{ concepts: BackendConcept[] }>(`/api/library/concepts${qs}`);
    return (data.concepts ?? []).map(mapConcept);
  },

  async getSubjectHierarchy(query?: string, subjectFilter?: string): Promise<SubjectSection[]> {
    const params = new URLSearchParams();
    if (subjectFilter && subjectFilter !== "all") params.set("subject", subjectFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const data = await apiFetch<{ sections: Array<{ subject_id: string; subject_name: string; total_concepts: number; domains: Array<{ domain_name: string; subject_id: string; subject_name: string; concepts: BackendConcept[] }> }> }>(
      `/api/library/hierarchy${qs}`
    );
    const needle = (query || "").trim().toLowerCase();
    return (data.sections ?? []).map((s) => ({
      subjectId: s.subject_id,
      subjectName: s.subject_name,
      totalConcepts: s.total_concepts,
      domains: (s.domains ?? []).map((d) => ({
        domainName: d.domain_name,
        subjectId: d.subject_id,
        subjectName: d.subject_name,
        concepts: (d.concepts ?? [])
          .map(mapConcept)
          .filter((c) =>
            needle
              ? (c.name + c.shortDescription + c.domain + c.chapterName + c.topicName).toLowerCase().includes(needle)
              : true
          ),
      })).filter((d) => d.concepts.length > 0),
    })).filter((s) => s.domains.length > 0);
  },

  async getRepositorySummary(): Promise<LibraryRepositorySummary> {
    const data = await apiFetch<{
      total_generated_videos: number;
      total_concepts: number;
      total_languages_supported: number;
      average_languages_per_concept: number;
      coverage_tiers: { full: number; high: number; moderate: number; low: number };
    }>("/api/library/summary");
    return {
      totalGeneratedVideos: data.total_generated_videos ?? 0,
      totalConcepts: data.total_concepts ?? 0,
      totalLanguagesSupported: data.total_languages_supported ?? 0,
      averageLanguagesPerConcept: data.average_languages_per_concept ?? 0,
      coverageTiers: data.coverage_tiers ?? { full: 0, high: 0, moderate: 0, low: 0 },
    };
  },

  async getGlobalVideoCount(): Promise<number> {
    const summary = await this.getRepositorySummary();
    return summary.totalGeneratedVideos;
  },
};
