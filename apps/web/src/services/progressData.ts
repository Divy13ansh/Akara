/**
 * Student Progress Data Service
 * 
 * Aggregates real student progress metrics, calculates active days this week,
 * and compiles the student's personal Learning Map (ONLY touched concepts: mastered, available, needs-revisit).
 * Untouched/locked concepts are strictly excluded.
 */

import { diagnosticService } from './diagnosticData';
import { ConceptNodeStatus } from './constellationData';

export type TouchedConceptStatus = 'mastered' | 'available' | 'needs-revisit';

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

const STORAGE_KEY_ACTIVITY_LOG = 'akara_activity_log';

// Helper to get formatted ISO date string for day (YYYY-MM-DD)
function getDayString(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Generate default active days in the current calendar week for initial state
function getInitialActiveDays(): string[] {
  const now = new Date();
  const currentDayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday, ..., 6 = Sunday
  const monday = new Date(now);
  monday.setDate(now.getDate() - currentDayOfWeek);

  const days: string[] = [];
  // Mark up to 4 days this week as active (Monday, Tuesday, Thursday, and today)
  for (let offset = 0; offset <= Math.min(currentDayOfWeek, 5); offset++) {
    if (offset !== 2) { // skip Wednesday for realistic variance
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      days.push(getDayString(d));
    }
  }
  // Ensure today is always in active days
  const todayStr = getDayString(now);
  if (!days.includes(todayStr)) {
    days.push(todayStr);
  }
  return days;
}

function getStoredActiveDays(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVITY_LOG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    const initial = getInitialActiveDays();
    localStorage.setItem(STORAGE_KEY_ACTIVITY_LOG, JSON.stringify(initial));
    return initial;
  } catch {
    return getInitialActiveDays();
  }
}

// Calculate active days strictly within the current week (Monday to Sunday)
function computeActiveDaysThisWeek(): number {
  const loggedDays = getStoredActiveDays();
  const now = new Date();
  const currentDayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - currentDayOfWeek);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const daysInWeek = loggedDays.filter((dayStr) => {
    const d = new Date(dayStr);
    return d >= monday && d <= sunday;
  });

  return new Set(daysInWeek).size;
}

// Base touched concepts catalog from active curriculum modules
interface RawTouchedConcept {
  id: string;
  name: string;
  shortDescription: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  topicName: string;
  defaultStatus: TouchedConceptStatus;
}

const RAW_TOUCHED_CATALOG: RawTouchedConcept[] = [
  // Science - Chemical Reactions and Equations
  {
    id: 'cr-01',
    name: 'Chemical Changes & Word Equations',
    shortDescription: 'Observing state transformations, evolution of gas, temperature variations, and writing foundational word equations.',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Chemical Equations & Balancing',
    defaultStatus: 'mastered',
  },
  {
    id: 'cr-02',
    name: 'Balancing Chemical Equations',
    shortDescription: 'Systematic stoichiometric balancing of reactants and products ensuring atom conservation.',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Chemical Equations & Balancing',
    defaultStatus: 'needs-revisit',
  },
  {
    id: 'cr-03',
    name: 'Law of Conservation of Mass',
    shortDescription: 'Verifying that total mass remains conserved throughout closed chemical transformations.',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Chemical Equations & Balancing',
    defaultStatus: 'mastered',
  },
  {
    id: 'cr-04',
    name: 'Combination & Decomposition Reactions',
    shortDescription: 'Exothermic synthesis of quicklime and thermal, electrolytic, and photolytic decomposition.',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Types of Chemical Reactions',
    defaultStatus: 'mastered',
  },
  {
    id: 'cr-05',
    name: 'Displacement & Double Displacement',
    shortDescription: 'Reactivity series displacing ions and aqueous precipitate formation.',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Types of Chemical Reactions',
    defaultStatus: 'mastered',
  },
  {
    id: 'cr-06',
    name: 'Oxidation and Reduction (Redox)',
    shortDescription: 'Tracking oxygen loss/gain, hydrogen transfer, and electron movement in redox systems.',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Types of Chemical Reactions',
    defaultStatus: 'available',
  },
  {
    id: 'cr-07',
    name: 'Corrosion & Rusting Prevention',
    shortDescription: 'Electrochemical degradation of iron and barrier/galvanic protection methods.',
    subjectId: 'science',
    subjectName: 'Science',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Effects of Oxidation in Everyday Life',
    defaultStatus: 'needs-revisit',
  },

  // Maths - Real Numbers
  {
    id: 'rn-01',
    name: "Euclid's Division Lemma",
    shortDescription: 'Given positive integers a and b, unique integers q and r satisfy a = bq + r, with 0 <= r < b.',
    subjectId: 'maths',
    subjectName: 'Maths',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: "Euclid's Division Lemma & Algorithm",
    defaultStatus: 'mastered',
  },
  {
    id: 'rn-02',
    name: 'Euclidean Algorithm for HCF',
    shortDescription: 'Iterative division method based on the lemma to calculate the HCF of two positive integers.',
    subjectId: 'maths',
    subjectName: 'Maths',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: "Euclid's Division Lemma & Algorithm",
    defaultStatus: 'needs-revisit',
  },
  {
    id: 'rn-03',
    name: 'Applications & Divisibility Proofs',
    shortDescription: 'Proving algebraic forms of odd and even integers and solving practical arrangement word problems.',
    subjectId: 'maths',
    subjectName: 'Maths',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: "Euclid's Division Lemma & Algorithm",
    defaultStatus: 'mastered',
  },
  {
    id: 'rn-04',
    name: 'The Fundamental Theorem of Arithmetic',
    shortDescription: 'Every composite number can be uniquely factored into primes regardless of sequence.',
    subjectId: 'maths',
    subjectName: 'Maths',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: 'The Fundamental Theorem of Arithmetic',
    defaultStatus: 'available',
  },
  {
    id: 'rn-06',
    name: 'Revisiting Irrational Numbers',
    shortDescription: 'Rigorous proof by contradiction showing numbers like √2 and 5 - √3 are irrational.',
    subjectId: 'maths',
    subjectName: 'Maths',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: 'Irrational Numbers & Decimal Expansions',
    defaultStatus: 'needs-revisit',
  },

  // Physics (Class 11–12)
  {
    id: 'phy-01',
    name: 'Dimensional Analysis & Applications',
    shortDescription: 'Checking dimensional consistency of equations and deriving physical formulas using dimensional methods.',
    subjectId: 'physics',
    subjectName: 'Physics',
    chapterId: 'units-measurements',
    chapterName: 'Units and Measurements',
    topicName: 'Dimensions of Physical Quantities',
    defaultStatus: 'mastered',
  },
  {
    id: 'phy-02',
    name: 'Instantaneous Velocity and Speed',
    shortDescription: 'Differential calculus formulations for limiting displacement rates on position-time curves.',
    subjectId: 'physics',
    subjectName: 'Physics',
    chapterId: 'motion-straight-line',
    chapterName: 'Motion in a Straight Line',
    topicName: 'Kinematics in 1D',
    defaultStatus: 'mastered',
  },
  {
    id: 'phy-03',
    name: 'Projectile Motion & Trajectory Parabola',
    shortDescription: 'Vector decomposition into independent horizontal uniform velocity and vertical gravitational acceleration.',
    subjectId: 'physics',
    subjectName: 'Physics',
    chapterId: 'motion-in-plane',
    chapterName: 'Motion in a Plane',
    topicName: '2D Kinematics',
    defaultStatus: 'mastered',
  },
  {
    id: 'phy-04',
    name: "Newton's Third Law and Action-Reaction Pairs",
    shortDescription: 'Forces always occur in matched interaction pairs acting on distinct bodies with equal magnitude.',
    subjectId: 'physics',
    subjectName: 'Physics',
    chapterId: 'laws-of-motion',
    chapterName: 'Laws of Motion',
    topicName: 'Laws of Motion',
    defaultStatus: 'needs-revisit',
  },
  {
    id: 'phy-05',
    name: 'Work-Energy Theorem for Variable Forces',
    shortDescription: 'Integral calculation of work done equating to total change in mechanical kinetic energy.',
    subjectId: 'physics',
    subjectName: 'Physics',
    chapterId: 'work-energy-power',
    chapterName: 'Work, Energy and Power',
    topicName: 'Work & Energy',
    defaultStatus: 'mastered',
  },

  // Chemistry (Class 11–12)
  {
    id: 'chem-01',
    name: 'Bohr Model of Hydrogen Atom',
    shortDescription: 'Quantized angular momentum orbits and spectral line photon emission derivations.',
    subjectId: 'chemistry',
    subjectName: 'Chemistry',
    chapterId: 'structure-of-atom',
    chapterName: 'Structure of Atom',
    topicName: 'Atomic Models',
    defaultStatus: 'mastered',
  },
  {
    id: 'chem-02',
    name: 'Electronegativity & Ionization Enthalpy Trends',
    shortDescription: 'Periodic trends across periods and down groups explained via effective nuclear charge.',
    subjectId: 'chemistry',
    subjectName: 'Chemistry',
    chapterId: 'periodicity-elements',
    chapterName: 'Classification of Elements and Periodicity',
    topicName: 'Periodic Trends',
    defaultStatus: 'mastered',
  },
  {
    id: 'chem-03',
    name: 'VSEPR Theory & Molecular Geometry',
    shortDescription: 'Predicting 3D molecular shapes by minimizing valence electron pair repulsion.',
    subjectId: 'chemistry',
    subjectName: 'Chemistry',
    chapterId: 'chemical-bonding',
    chapterName: 'Chemical Bonding and Molecular Structure',
    topicName: 'Molecular Geometry',
    defaultStatus: 'needs-revisit',
  },
  {
    id: 'chem-04',
    name: 'First Law of Thermodynamics & Enthalpy',
    shortDescription: 'Internal energy conservation ΔU = q + w and state function enthalpy transformations.',
    subjectId: 'chemistry',
    subjectName: 'Chemistry',
    chapterId: 'thermodynamics',
    chapterName: 'Thermodynamics',
    topicName: 'Thermodynamic Laws',
    defaultStatus: 'mastered',
  },

  // Biology (Class 11–12)
  {
    id: 'bio-01',
    name: 'Binomial Nomenclature & Taxonomic Hierarchy',
    shortDescription: 'Linnaean rules for scientific naming and kingdom-to-species classification rankings.',
    subjectId: 'biology',
    subjectName: 'Biology',
    chapterId: 'living-world',
    chapterName: 'The Living World',
    topicName: 'Diversity of Life',
    defaultStatus: 'mastered',
  },
  {
    id: 'bio-02',
    name: 'Five Kingdom Classification & Monera',
    shortDescription: 'Whittaker system criteria emphasizing cell structure, body organization, and mode of nutrition.',
    subjectId: 'biology',
    subjectName: 'Biology',
    chapterId: 'biological-classification',
    chapterName: 'Biological Classification',
    topicName: 'Biological Classification',
    defaultStatus: 'mastered',
  },
  {
    id: 'bio-05',
    name: 'Cell Membrane Fluid Mosaic Model',
    shortDescription: 'Phospholipid bilayer organization with quasi-fluid protein motility proposed by Singer & Nicolson.',
    subjectId: 'biology',
    subjectName: 'Biology',
    chapterId: 'cell-unit-of-life',
    chapterName: 'Cell: The Unit of Life',
    topicName: 'Cell Membrane & Transport',
    defaultStatus: 'needs-revisit',
  },
  {
    id: 'bio-06',
    name: 'Structure and Function of Nucleic Acids',
    shortDescription: 'DNA double-helix antiparallel strands, nitrogenous base pairing, and phosphodiester backbones.',
    subjectId: 'biology',
    subjectName: 'Biology',
    chapterId: 'biomolecules',
    chapterName: 'Biomolecules',
    topicName: 'Biomacromolecules',
    defaultStatus: 'mastered',
  },
];

export const progressService = {
  /**
   * Log an active student interaction for today
   */
  logActivity(): void {
    try {
      const days = getStoredActiveDays();
      const today = getDayString(new Date());
      if (!days.includes(today)) {
        days.push(today);
        localStorage.setItem(STORAGE_KEY_ACTIVITY_LOG, JSON.stringify(days));
      }
    } catch {
      // ignore
    }
  },

  /**
   * Fetches the student's real progress summary metrics:
   * - Concepts Mastered (count of touched concepts with status 'mastered')
   * - Concepts to Revisit (count of touched concepts with status 'needs-revisit')
   * - Active Days This Week (computed from logged activity dates)
   */
  async getProgressSummary(): Promise<StudentProgressSummary> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/progress/summary.
    // The current summary is calculated from local mock data, activity logs, and active diagnostics.
    await new Promise((resolve) => setTimeout(resolve, 80));
    const groups = await this.getTouchedConceptsBySubject();

    let mastered = 0;
    let revisit = 0;

    groups.forEach((g) => {
      mastered += g.masteredCount;
      revisit += g.revisitCount;
    });

    const activeDays = computeActiveDaysThisWeek();

    return {
      conceptsMastered: mastered,
      conceptsToRevisit: revisit,
      activeDaysThisWeek: activeDays,
    };
  },

  /**
   * Fetches ONLY touched concepts (mastered, available, needs-revisit) grouped by subject.
   * Untouched/locked concepts are excluded.
   * Integrates live localStorage constellation updates & diagnostic records.
   */
  async getTouchedConceptsBySubject(): Promise<SubjectProgressGroup[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/progress/learning-map.
    // The current list is assembled from local mock touched concepts plus persisted constellation state.
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Get active diagnostics to cross-reference concepts needing attention
    const activeDiagnostics = await diagnosticService.getActiveDiagnostics();
    const diagnosticMap = new Map<string, string>();
    activeDiagnostics.forEach((d) => {
      diagnosticMap.set(d.conceptId, d.diagnosticInsight);
    });

    // Check localStorage constellation overrides
    const groupsMap = new Map<string, SubjectProgressGroup>();

    RAW_TOUCHED_CATALOG.forEach((raw) => {
      // Read any localStorage status from constellation
      const storageKey = `akara_constellation_${raw.subjectId}_${raw.chapterId}`;
      let liveStatus: ConceptNodeStatus | null = null;
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed[raw.id]) liveStatus = parsed[raw.id];
        }
      } catch {
        // ignore
      }

      // Determine final status
      let finalStatus: TouchedConceptStatus = raw.defaultStatus;

      // If there is an active misconception diagnostic for this concept, it MUST be 'needs-revisit'
      if (diagnosticMap.has(raw.id)) {
        finalStatus = 'needs-revisit';
      } else if (liveStatus === 'mastered') {
        finalStatus = 'mastered';
      } else if (liveStatus === 'available') {
        finalStatus = 'available';
      }

      const touched: TouchedConcept = {
        id: raw.id,
        name: raw.name,
        shortDescription: raw.shortDescription,
        status: finalStatus,
        subjectId: raw.subjectId,
        subjectName: raw.subjectName,
        chapterId: raw.chapterId,
        chapterName: raw.chapterName,
        topicName: raw.topicName,
        diagnosticInsight: diagnosticMap.get(raw.id),
      };

      if (!groupsMap.has(raw.subjectId)) {
        groupsMap.set(raw.subjectId, {
          subjectId: raw.subjectId,
          subjectName: raw.subjectName,
          masteredCount: 0,
          revisitCount: 0,
          availableCount: 0,
          concepts: [],
        });
      }

      const group = groupsMap.get(raw.subjectId)!;
      group.concepts.push(touched);
      if (finalStatus === 'mastered') group.masteredCount++;
      else if (finalStatus === 'needs-revisit') group.revisitCount++;
      else if (finalStatus === 'available') group.availableCount++;
    });

    return Array.from(groupsMap.values());
  },
};
