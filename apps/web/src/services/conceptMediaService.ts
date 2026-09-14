import { apiFetch } from "./http";
import { authService } from "./api";

export type BackendGenerationStatus =
  | "instant"
  | "generating_first_time"
  | "queued"
  | "locked"
  | "failed"
  | "finishing_dub";

export interface GenerationStatusResponse {
  status: BackendGenerationStatus;
  progressPercent: number;
  currentStage?: string;
  estimatedSecondsRemaining?: number;
  availableLanguages: string[];
  conceptId: string;
  language: string;
  queuePosition?: number;
}

export interface SceneGraphNode {
  id: string;
  label: string;
  type: string;
  description: string;
}

export interface SceneGraphEdge {
  from: string;
  to: string;
  label: string;
}

export interface SceneGraphData {
  nodes: SceneGraphNode[];
  edges: SceneGraphEdge[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  concept?: string;
}

export interface ConceptScript {
  fullTranscript: string;
  summaryBullets: string[];
  keyDefinitions: Array<{ term: string; definition: string }>;
  ncertSummary: string;
}

export interface MentorPromptData {
  scenario: "mastery_confirmation" | "misconception_check";
  scenarioLabel: string;
  questionText: string;
  mentorPromptAudioDurationSeconds: number;
  deliberateMisconception?: string;
  keyPrinciplesToCover: string[];
  sampleIdealResponse: string;
}

export interface VideoScene {
  time: number;
  title: string;
  caption: string;
  graphicType: "equation" | "diagram" | "graph" | "apparatus" | "reaction";
  formulaOrFormulaSnippet?: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface GeneratedConceptData {
  conceptId: string;
  conceptName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  topicName: string;
  classNumber: number;
  ncertCitation: string;
  language: string;
  availableLanguages: string[];
  video: {
    title: string;
    durationSeconds: number;
    durationFormatted: string;
    scenes: VideoScene[];
  };
  videoUrl: string | null;
  audioUrl: string | null;
  quizStatus: "ready" | "generating" | "failed";
  flashcards: Flashcard[];
  script: ConceptScript;
  sceneGraph: SceneGraphData | null;
  quiz: QuizQuestion[];
  mentorPrompt: MentorPromptData | null;
}

export interface ExplanationEvaluationResult {
  isMastered: boolean;
  scorePercent: number;
  feedbackHeadline: string;
  mentorFeedbackText: string;
  pointsCovered: string[];
  pointsMissed: string[];
  diagnosticResolved: boolean;
  sessionId?: string;
}

interface BackendStatus {
  status: string;
  progress_percent?: number;
  current_stage?: string;
  estimated_seconds_remaining?: number;
  available_languages?: string[];
  concept_id: string;
  language: string;
  queue_position?: number;
}

function mapStatus(b: BackendStatus): GenerationStatusResponse {
  return {
    status: b.status as BackendGenerationStatus,
    progressPercent: b.progress_percent ?? 0,
    currentStage: b.current_stage,
    estimatedSecondsRemaining: b.estimated_seconds_remaining,
    availableLanguages: b.available_languages ?? [],
    conceptId: b.concept_id,
    language: b.language,
    queuePosition: b.queue_position,
  };
}

interface BackendQuizItem {
  id?: string;
  question?: string;
  options?: string[];
  correct_index?: number;
  correctIndex?: number;
  explanation?: string;
  concept?: string;
}

interface BackendMedia {
  concept_id: string;
  concept_name: string;
  ncert_citation?: string;
  language: string;
  available_languages?: string[];
  video?: {
    title?: string;
    url?: string | null;
    audio_url?: string | null;
    duration_seconds?: number;
    duration_formatted?: string;
  };
  script?: {
    full_transcript?: string;
    fullTranscript?: string;
    summary_bullets?: string[];
    summaryBullets?: string[];
    key_definitions?: Array<{ term?: string; definition?: string } | string>;
    keyDefinitions?: Array<{ term: string; definition: string }>;
    ncert_summary?: string;
    ncertSummary?: string;
  };
  scene_graph?: { nodes?: SceneGraphNode[]; edges?: SceneGraphEdge[] } | null;
  quiz?: BackendQuizItem[];
  quiz_status?: "ready" | "generating" | "failed";
  flashcards?: Array<{ front?: string; back?: string } | string>;
  mentor_prompt?: {
    scenario?: string;
    question_text?: string;
    questionText?: string;
  } | null;
}

function mapMedia(b: BackendMedia): GeneratedConceptData {
  const s = b.script ?? {};
  const bullets = s.summary_bullets ?? s.summaryBullets ?? [];
  const rawDefs = s.key_definitions ?? s.keyDefinitions ?? [];
  const keyDefinitions = (rawDefs as Array<{ term?: string; definition?: string } | string>).map(
    (d) => (typeof d === "string" ? { term: d, definition: "" } : { term: d.term ?? "", definition: d.definition ?? "" })
  );
  const quiz: QuizQuestion[] = (b.quiz ?? []).map((q, i) => ({
    id: q.id ?? `q-${i + 1}`,
    question: q.question ?? "",
    options: q.options ?? [],
    correctIndex: q.correct_index ?? q.correctIndex ?? 0,
    explanation: q.explanation ?? "",
    concept: q.concept,
  }));
  const flashcards: Flashcard[] = (b.flashcards ?? []).map((f) =>
    typeof f === "string" ? { front: f, back: "" } : { front: f.front ?? "", back: f.back ?? "" }
  );
  const duration = b.video?.duration_seconds ?? 0;
  const mp = b.mentor_prompt;
  return {
    conceptId: b.concept_id,
    conceptName: b.concept_name,
    subjectId: "",
    subjectName: "",
    chapterId: "",
    chapterName: "",
    topicName: "",
    classNumber: 10,
    ncertCitation: b.ncert_citation ?? "",
    language: b.language,
    availableLanguages: b.available_languages ?? [],
    video: {
      title: b.video?.title ?? `${b.concept_name} — Full Explainer`,
      durationSeconds: duration,
      durationFormatted:
        b.video?.duration_formatted ?? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`,
      scenes: [],
    },
    videoUrl: b.video?.url ?? null,
    audioUrl: b.video?.audio_url ?? null,
    quizStatus: b.quiz_status ?? (quiz.length > 0 ? "ready" : "generating"),
    flashcards,
    script: {
      fullTranscript: s.full_transcript ?? s.fullTranscript ?? "",
      summaryBullets: bullets,
      keyDefinitions,
      ncertSummary: s.ncert_summary ?? s.ncertSummary ?? "",
    },
    sceneGraph: b.scene_graph ? { nodes: b.scene_graph.nodes ?? [], edges: b.scene_graph.edges ?? [] } : null,
    quiz,
    mentorPrompt: mp
      ? {
          scenario: mp.scenario === "misconception_check" ? "misconception_check" : "mastery_confirmation",
          scenarioLabel: mp.scenario === "misconception_check" ? "Targeted Misconception Check" : "Mastery Confirmation",
          questionText: mp.question_text ?? mp.questionText ?? "",
          mentorPromptAudioDurationSeconds: 14,
          keyPrinciplesToCover: [],
          sampleIdealResponse: "",
        }
      : null,
  };
}

export interface VoiceToken {
  token: string;
  room: string;
  url: string;
  warnings?: string[];
}

export const conceptMediaService = {
  async getGenerationStatus(conceptId: string, language?: string): Promise<GenerationStatusResponse> {
    const user = authService.getCurrentUser();
    const lang = language || user?.default_language || "hi";
    const qs = language ? `?lang=${encodeURIComponent(language)}` : `?lang=${encodeURIComponent(lang)}`;
    const data = await apiFetch<BackendStatus>(
      `/api/concepts/${encodeURIComponent(conceptId)}/generation-status${qs}`
    );
    return mapStatus(data);
  },

  async pollGenerationStatus(
    conceptId: string,
    language: string | undefined,
    onUpdate: (s: GenerationStatusResponse) => void,
    intervalMs = 5000,
    maxAttempts = 60
  ): Promise<GenerationStatusResponse> {
    let last = await this.getGenerationStatus(conceptId, language);
    onUpdate(last);
    for (let i = 0; i < maxAttempts; i++) {
      if (last.status === "instant" || last.status === "failed" || last.status === "locked") return last;
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        last = await this.getGenerationStatus(conceptId, language);
        onUpdate(last);
      } catch { /* keep polling on transient errors */ }
    }
    return last;
  },

  markGenerationReady(_conceptId: string, _language: string): void {},

  setTestStatus(_conceptId: string, _language: string, _status: BackendGenerationStatus): void {},

  async getGeneratedConceptData(conceptId: string, requestedLanguage?: string): Promise<GeneratedConceptData> {
    const user = authService.getCurrentUser();
    const language = requestedLanguage || user?.default_language || "hi";
    const data = await apiFetch<BackendMedia>(
      `/api/concepts/${encodeURIComponent(conceptId)}/media?lang=${encodeURIComponent(language)}`
    );
    return mapMedia(data);
  },

  async evaluateExplanation(
    conceptId: string,
    studentAnswerText: string,
    scenario: "mastery_confirmation" | "misconception_check",
    language: string
  ): Promise<ExplanationEvaluationResult> {
    const data = await apiFetch<{
      is_mastered: boolean;
      score_percent: number;
      feedback_headline: string;
      mentor_feedback_text: string;
      points_covered: string[];
      points_missed: string[];
      diagnostic_resolved: boolean;
      session_id?: string;
    }>(`/api/concepts/${encodeURIComponent(conceptId)}/evaluate-explanation`, {
      method: "POST",
      body: JSON.stringify({ student_answer_text: studentAnswerText, scenario, language }),
    });
    return {
      isMastered: data.is_mastered,
      scorePercent: data.score_percent,
      feedbackHeadline: data.feedback_headline,
      mentorFeedbackText: data.mentor_feedback_text,
      pointsCovered: data.points_covered ?? [],
      pointsMissed: data.points_missed ?? [],
      diagnosticResolved: data.diagnostic_resolved ?? false,
      sessionId: data.session_id,
    };
  },

  async askDoubt(
    conceptId: string,
    question: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    language?: string
  ): Promise<{ answer: string; language: string }> {
    const user = authService.getCurrentUser();
    return apiFetch<{ answer: string; language: string }>(
      `/api/concepts/${encodeURIComponent(conceptId)}/doubts`,
      {
        method: "POST",
        body: JSON.stringify({ question, history, language: language || user?.default_language || "hi" }),
      }
    );
  },

  async getVoiceToken(conceptId: string, language?: string): Promise<VoiceToken> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error("Sign in to start a voice session.");
    const lang = language || user.default_language || "hi";
    const data = await apiFetch<{ token: string; room: string; url: string; warnings?: string[] }>(
      `/token?student_id=${encodeURIComponent(user.id)}&topic_id=${encodeURIComponent(conceptId)}&lang=${encodeURIComponent(lang)}`
    );
    return { token: data.token, room: data.room, url: data.url, warnings: data.warnings };
  },
};
