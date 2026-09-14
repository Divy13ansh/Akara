import { apiFetch } from "./http";

export interface MisconceptionDiagnostic {
  id: string;
  conceptId: string;
  conceptName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  topicName: string;
  detectedAt: string;
  severity: "high" | "medium" | "low";
  diagnosticInsight: string;
  actionableHint: string;
  status: "needs_review" | "resolved";
}

interface BackendDiagnostic {
  id: string;
  concept_id: string;
  concept_name: string;
  subject_id: string | null;
  subject_name: string | null;
  chapter_id: string | null;
  chapter_name: string | null;
  topic_name: string | null;
  detected_at: string;
  severity: "high" | "medium" | "low";
  diagnostic_insight: string;
  actionable_hint: string;
  status: "needs_review" | "resolved";
}

function mapDiagnostic(d: BackendDiagnostic): MisconceptionDiagnostic {
  return {
    id: d.id,
    conceptId: d.concept_id,
    conceptName: d.concept_name,
    subjectId: d.subject_id ?? "",
    subjectName: d.subject_name ?? "",
    chapterId: d.chapter_id ?? "",
    chapterName: d.chapter_name ?? "",
    topicName: d.topic_name ?? "",
    detectedAt: d.detected_at,
    severity: d.severity,
    diagnosticInsight: d.diagnostic_insight,
    actionableHint: d.actionable_hint,
    status: d.status,
  };
}

let cache: MisconceptionDiagnostic[] = [];

export const diagnosticService = {
  getDiagnosticForConcept(conceptId: string): MisconceptionDiagnostic | undefined {
    return cache.find((d) => d.conceptId === conceptId && d.status === "needs_review");
  },

  async getActiveDiagnostics(): Promise<MisconceptionDiagnostic[]> {
    try {
      const data = await apiFetch<{ diagnostics: BackendDiagnostic[] }>(
        "/api/diagnostics/misconceptions"
      );
      cache = (data.diagnostics ?? []).map(mapDiagnostic);
      return cache.filter((d) => d.status === "needs_review");
    } catch {
      return cache.filter((d) => d.status === "needs_review");
    }
  },

  async getAllDiagnostics(): Promise<MisconceptionDiagnostic[]> {
    try {
      const data = await apiFetch<{ diagnostics: BackendDiagnostic[] }>(
        "/api/diagnostics/misconceptions"
      );
      cache = (data.diagnostics ?? []).map(mapDiagnostic);
      return cache;
    } catch {
      return cache;
    }
  },

  async resolveDiagnostic(diagnosticId: string): Promise<void> {
    await apiFetch(`/api/diagnostics/${encodeURIComponent(diagnosticId)}/resolve`, {
      method: "POST",
    });
    cache = cache.map((d) => (d.id === diagnosticId ? { ...d, status: "resolved" as const } : d));
  },

  async resetDiagnostics(): Promise<void> {
    cache = [];
  },
};
