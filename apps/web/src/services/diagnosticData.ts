/**
 * Misconception & Diagnostic Data Service
 * 
 * Manages targeted student diagnostics, error-analysis logs, and conceptual gap detections.
 * Strictly avoids generic completion nudges — every record reflects a concrete, syllabus-specific
 * diagnostic misconception detected during practice, reasoning, or assessment.
 */

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
  severity: 'high' | 'medium' | 'low';
  /**
   * The concrete diagnostic finding — what conceptual misunderstanding was identified
   */
  diagnosticInsight: string;
  /**
   * Focused learning hint pointing directly to the rule or principle to review
   */
  actionableHint: string;
  status: 'needs_review' | 'resolved';
}

const STORAGE_KEY_DIAGNOSTICS = 'akara_diagnostics_log';

// Seed authentic Class 10 NCERT misconceptions
const INITIAL_DIAGNOSTICS: MisconceptionDiagnostic[] = [
  {
    id: 'diag-01',
    conceptId: 'cr-02',
    conceptName: 'Balancing Chemical Equations',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Chemical Equations & Balancing',
    detectedAt: '2 days ago',
    severity: 'high',
    diagnosticInsight:
      'Tendency to modify chemical subscripts (e.g. changing O₂ to O₃) to balance oxygen, violating the rule of molecular composition rather than adjusting stoichiometric coefficients.',
    actionableHint:
      'Always keep formulas fixed; adjust only front stoichiometric multipliers so atom counts balance on both sides.',
    status: 'needs_review',
  },
  {
    id: 'diag-02',
    conceptId: 'cr-07',
    conceptName: 'Corrosion & Rusting Prevention',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Effects of Oxidation in Everyday Life',
    detectedAt: 'Yesterday',
    severity: 'medium',
    diagnosticInsight:
      'Confusing galvanic sacrificial protection with inert barrier coating; assumed zinc prevents iron corrosion by being non-reactive rather than more electrochemically active.',
    actionableHint:
      'Zinc acts as a sacrificial anode because it oxidizes preferentially before iron, protecting the underlying metal even when scratched.',
    status: 'needs_review',
  },
  {
    id: 'diag-03',
    conceptId: 'rn-02',
    conceptName: 'Euclidean Algorithm for HCF',
    subjectId: 'maths',
    subjectName: 'Maths',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: "Euclid's Division Lemma & Algorithm",
    detectedAt: '3 days ago',
    severity: 'high',
    diagnosticInsight:
      'Terminating the iterative division sequence prematurely when the quotient equals 1, rather than continuing until the remainder reaches r = 0.',
    actionableHint:
      'The HCF is the divisor at the exact step where the remainder becomes zero, not when the quotient becomes one.',
    status: 'needs_review',
  },
  {
    id: 'diag-04',
    conceptId: 'rn-06',
    conceptName: 'Revisiting Irrational Numbers',
    subjectId: 'maths',
    subjectName: 'Maths',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: 'Irrational Numbers & Decimal Expansions',
    detectedAt: '4 days ago',
    severity: 'medium',
    diagnosticInsight:
      'Omission of the co-prime precondition gcd(a, b) = 1 in the initial hypothesis for proof by contradiction of √2 irrationality.',
    actionableHint:
      'The contradiction hinges on finding a common factor for both a and b, which directly conflicts with the foundational premise that a and b are co-prime integers.',
    status: 'needs_review',
  },
  {
    id: 'diag-05',
    conceptId: 'phy-04',
    conceptName: 'Newton\'s Third Law and Action-Reaction Pairs',
    subjectId: 'physics',
    subjectName: 'Physics',
    chapterId: 'laws-of-motion',
    chapterName: 'Laws of Motion',
    topicName: 'Laws of Motion',
    detectedAt: 'Yesterday',
    severity: 'high',
    diagnosticInsight:
      'Assuming action and reaction forces cancel each other out on the same object, failing to recognize that they act on two entirely distinct bodies.',
    actionableHint:
      'Action and reaction forces never act on the same body; net acceleration depends only on external forces acting on that single isolated body.',
    status: 'needs_review',
  },
  {
    id: 'diag-06',
    conceptId: 'chem-03',
    conceptName: 'VSEPR Theory & Molecular Geometry',
    subjectId: 'chemistry',
    subjectName: 'Chemistry',
    chapterId: 'chemical-bonding',
    chapterName: 'Chemical Bonding and Molecular Structure',
    topicName: 'Molecular Geometry',
    detectedAt: '2 days ago',
    severity: 'medium',
    diagnosticInsight:
      'Treating lone pairs and bond pairs as exerting identical electrostatic repulsion, leading to incorrect predicted bond angles in NH₃ and H₂O.',
    actionableHint:
      'Lone pair - lone pair repulsion > lone pair - bond pair repulsion > bond pair - bond pair repulsion. Lone pairs compress adjacent bond angles.',
    status: 'needs_review',
  },
  {
    id: 'diag-07',
    conceptId: 'bio-05',
    conceptName: 'Cell Membrane Fluid Mosaic Model',
    subjectId: 'biology',
    subjectName: 'Biology',
    chapterId: 'cell-unit-of-life',
    chapterName: 'Cell: The Unit of Life',
    topicName: 'Cell Membrane & Transport',
    detectedAt: '3 days ago',
    severity: 'high',
    diagnosticInsight:
      'Confusing passive facilitated diffusion with active transport across transmembrane protein channels; omitted ATP requirement.',
    actionableHint:
      'Facilitated diffusion moves solutes along a concentration gradient without ATP expenditure, whereas active transport pumps solutes against gradients using ATP.',
    status: 'needs_review',
  },
];

function getStoredDiagnostics(): MisconceptionDiagnostic[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DIAGNOSTICS);
    if (raw) {
      return JSON.parse(raw);
    }
    localStorage.setItem(STORAGE_KEY_DIAGNOSTICS, JSON.stringify(INITIAL_DIAGNOSTICS));
    return INITIAL_DIAGNOSTICS;
  } catch {
    return INITIAL_DIAGNOSTICS;
  }
}

function saveStoredDiagnostics(list: MisconceptionDiagnostic[]) {
  try {
    localStorage.setItem(STORAGE_KEY_DIAGNOSTICS, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export const diagnosticService = {
  /**
   * Synchronously checks if a concept has an active unresolved diagnostic
   */
  getDiagnosticForConcept(conceptId: string): MisconceptionDiagnostic | undefined {
    const list = getStoredDiagnostics();
    return list.find((d) => d.conceptId === conceptId && d.status === 'needs_review');
  },

  /**
   * Fetches all active misconception diagnostics requiring student attention
   */
  async getActiveDiagnostics(): Promise<MisconceptionDiagnostic[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/diagnostics/misconceptions.
    // The current diagnostics list comes from the local mock dataset and should come from backend.
    // Simulating light async network latency
    await new Promise((resolve) => setTimeout(resolve, 80));
    const list = getStoredDiagnostics();
    return list.filter((d) => d.status === 'needs_review');
  },

  /**
   * Fetches all diagnostics (including resolved)
   */
  async getAllDiagnostics(): Promise<MisconceptionDiagnostic[]> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return getStoredDiagnostics();
  },

  /**
   * Marks a diagnostic as resolved
   */
  async resolveDiagnostic(diagnosticId: string): Promise<void> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by POST /api/diagnostics/:diagnosticId/resolve.
    // The current method only updates local mock state; backend should mark the diagnostic resolved server-side.
    const list = getStoredDiagnostics();
    const updated = list.map((d) =>
      d.id === diagnosticId ? { ...d, status: 'resolved' as const } : d
    );
    saveStoredDiagnostics(updated);
  },

  /**
   * Resets diagnostics to initial state (for testing/demo purposes)
   */
  async resetDiagnostics(): Promise<void> {
    saveStoredDiagnostics(INITIAL_DIAGNOSTICS);
  },
};
