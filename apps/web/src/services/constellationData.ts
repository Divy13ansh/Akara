/**
 * Akara Constellation Data Service
 * 
 * Provides topic-wise concepts, node prerequisite graphs, and persistent mastery states
 * for the constellation learning path.
 */

export type ConceptNodeStatus = 'locked' | 'available' | 'mastered' | 'requested' | 'needs-revisit';

export interface ConceptNode {
  id: string;
  order: number;
  name: string;
  short_description: string;
  status: ConceptNodeStatus;
  topic_id: string;
  topic_number: number;
  topic_name: string;
  prerequisite_id: string | null;
  prerequisite_name?: string;
  video_duration?: string;
  feynman_cleared?: boolean;
  target_language?: string;
  chapter_id?: string;
  chapter_name?: string;
  subject_id?: string;
  subject_name?: string;
  available_languages?: string[];
}

export interface TopicGroup {
  id: string;
  topic_number: number;
  name: string;
  description: string;
  concepts: ConceptNode[];
}

export interface ChapterConstellation {
  chapter_id: string;
  subject_id: string;
  chapter_number: number;
  chapter_name: string;
  total_concepts: number;
  mastered_concepts: number;
  topics: TopicGroup[];
}

const STORAGE_PREFIX = 'akara_constellation_';

// Real NCERT curriculum topic & concept datasets
const CURRICULUM_CONSTELLATIONS: Record<string, { topics: Array<{ name: string; description: string; concepts: Array<{ id: string; name: string; desc: string; status?: ConceptNodeStatus; prereq?: string }> }> }> = {
  'chemical-reactions': {
    topics: [
      {
        name: 'Chemical Equations & Balancing',
        description: 'Word equations, symbolic representations, and conservation laws.',
        concepts: [
          {
            id: 'cr-01',
            name: 'Chemical Changes & Word Equations',
            desc: 'Observing state transformations, evolution of gas, temperature variations, and writing foundational word equations.',
            status: 'mastered',
          },
          {
            id: 'cr-02',
            name: 'Balancing Chemical Equations',
            desc: 'Systematic stoichiometric balancing of reactants and products ensuring atom conservation.',
            status: 'mastered',
            prereq: 'cr-01',
          },
          {
            id: 'cr-03',
            name: 'Law of Conservation of Mass',
            desc: 'Verifying that total mass remains conserved throughout closed chemical transformations.',
            status: 'mastered',
            prereq: 'cr-02',
          },
        ],
      },
      {
        name: 'Types of Chemical Reactions',
        description: 'Categorizing reaction mechanisms by thermodynamic and atomic behavior.',
        concepts: [
          {
            id: 'cr-04',
            name: 'Combination & Exothermic Reactions',
            desc: 'Reactions where two or more substances combine to form a single product with heat release.',
            status: 'mastered',
            prereq: 'cr-03',
          },
          {
            id: 'cr-05',
            name: 'Decomposition Reactions',
            desc: 'Thermal, electrolytic, and photolytic breakdown of compounds into simpler constituent substances.',
            status: 'mastered',
            prereq: 'cr-04',
          },
          {
            id: 'cr-06',
            name: 'Displacement Reactions & Activity',
            desc: 'Single displacement reactions governed by the chemical reactivity series of metals.',
            status: 'available',
            prereq: 'cr-05',
          },
          {
            id: 'cr-07',
            name: 'Double Displacement & Precipitation',
            desc: 'Exchange of cations and anions between aqueous solutions yielding insoluble precipitates.',
            status: 'locked',
            prereq: 'cr-06',
          },
        ],
      },
      {
        name: 'Redox Reactions & Daily Life',
        description: 'Electron and oxygen transfers, corrosion mechanics, and preservation.',
        concepts: [
          {
            id: 'cr-08',
            name: 'Oxidation and Reduction (Redox)',
            desc: 'Simultaneous loss and gain of oxygen, hydrogen, or electrons in chemical transformations.',
            status: 'locked',
            prereq: 'cr-07',
          },
          {
            id: 'cr-09',
            name: 'Corrosion & Rusting Prevention',
            desc: 'Atmospheric oxidation of metals and preventative electroplating and galvanization techniques.',
            status: 'locked',
            prereq: 'cr-08',
          },
          {
            id: 'cr-10',
            name: 'Rancidity & Antioxidants',
            desc: 'Aerial oxidation of fats and oils in foodstuffs and preservation with nitrogen gas.',
            status: 'locked',
            prereq: 'cr-09',
          },
        ],
      },
    ],
  },
  'acids-bases-salts': {
    topics: [
      {
        name: 'Properties of Acids and Bases',
        description: 'Indicators, olfactory sensors, and chemical interactions with metals.',
        concepts: [
          { id: 'abs-01', name: 'Indicators & Chemical Properties', desc: 'Litmus, methyl orange, phenolphthalein, and reaction of acids with active metals.', status: 'mastered' },
          { id: 'abs-02', name: 'Reaction with Carbonates', desc: 'Formation of carbon dioxide, salt, and water from carbonate compounds.', status: 'mastered', prereq: 'abs-01' },
          { id: 'abs-03', name: 'Neutralization Reactions', desc: 'Aqueous acid-base titration yielding ionic salts and water.', status: 'available', prereq: 'abs-02' },
        ],
      },
      {
        name: 'pH Scale & Daily Applications',
        description: 'Hydrogen ion concentration logarithmic scale and environmental impacts.',
        concepts: [
          { id: 'abs-04', name: 'Understanding pH & Universal Indicator', desc: 'The 0-14 logarithmic scale measuring hydronium ion concentration in solution.', status: 'locked', prereq: 'abs-03' },
          { id: 'abs-05', name: 'pH in Living Organisms & Soil', desc: 'Self-defense by animals and plants via acids, tooth decay, and digestive pH.', status: 'locked', prereq: 'abs-04' },
        ],
      },
      {
        name: 'Family of Salts & Industrial Chemistry',
        description: 'Chemicals from common salt: bleaching powder, baking soda, and plaster of Paris.',
        concepts: [
          { id: 'abs-06', name: 'Common Salt Derivatives (NaOH, Cl2)', desc: 'Chlor-alkali process yielding sodium hydroxide, chlorine gas, and hydrogen.', status: 'locked', prereq: 'abs-05' },
          { id: 'abs-07', name: 'Baking Soda & Washing Soda', desc: 'Synthesis of sodium hydrogen carbonate and sodium carbonate decahydrate.', status: 'locked', prereq: 'abs-06' },
        ],
      },
    ],
  },
  'real-numbers': {
    topics: [
      {
        name: "Euclid's Division Lemma & Algorithm",
        description: 'Integer divisibility properties, computing highest common factors, and step-wise proofs.',
        concepts: [
          { id: 'rn-01', name: "Euclid's Division Lemma", desc: 'Given positive integers a and b, there exist unique integers q and r satisfying a = bq + r, where 0 <= r < b.', status: 'mastered' },
          { id: 'rn-02', name: 'Euclidean Algorithm for HCF', desc: 'Iterative division method based on the lemma to calculate the HCF of two positive integers.', status: 'mastered', prereq: 'rn-01' },
          { id: 'rn-03', name: 'Applications & Divisibility Proofs', desc: 'Proving forms of odd/even integers (e.g. 4q+1, 6q+3) and solving practical arrangement word problems.', status: 'mastered', prereq: 'rn-02' },
        ],
      },
      {
        name: 'The Fundamental Theorem of Arithmetic',
        description: 'Unique prime factor decomposition and relationship with HCF and LCM.',
        concepts: [
          { id: 'rn-04', name: 'Fundamental Theorem of Arithmetic', desc: 'Every composite number can be uniquely factored into prime powers, regardless of the order of factors.', status: 'available', prereq: 'rn-03' },
          { id: 'rn-05', name: 'HCF and LCM Product Property', desc: 'For two positive numbers a and b, HCF(a, b) * LCM(a, b) = a * b. Prime factorisation methods.', status: 'locked', prereq: 'rn-04' },
        ],
      },
      {
        name: 'Irrational Numbers & Decimal Expansions',
        description: 'Contradiction proofs for irrationality and terminating conditions for rational decimals.',
        concepts: [
          { id: 'rn-06', name: 'Revisiting Irrational Numbers', desc: 'Rigorous proof by contradiction showing that numbers like √2, √3, and 5 - √3 are irrational.', status: 'locked', prereq: 'rn-05' },
          { id: 'rn-07', name: 'Decimal Expansions of Rational Numbers', desc: 'Characterizing terminating versus non-terminating recurring decimals based on the prime factors of denominator (2^n * 5^m).', status: 'locked', prereq: 'rn-06' },
        ],
      },
    ],
  },
  'motion-straight-line': {
    topics: [
      {
        name: 'Kinematic Foundations & Position',
        description: 'Frame of reference, rectilinear coordinates, path length, and displacement vectors.',
        concepts: [
          { id: 'msl-01', name: 'Position, Path Length & Displacement', desc: 'Reference frames, one-dimensional coordinate systems, path length scalar versus displacement vector.', status: 'mastered' },
          { id: 'msl-02', name: 'Average Velocity & Average Speed', desc: 'Ratio of displacement to time interval, distinction between scalar distance and directional rate.', status: 'mastered', prereq: 'msl-01' },
          { id: 'msl-03', name: 'Instantaneous Velocity & Speed', desc: 'Limiting rate of change of displacement dx/dt and slope of tangent on position-time graph.', status: 'available', prereq: 'msl-02' },
        ],
      },
      {
        name: 'Accelerated Motion & Kinematic Equations',
        description: 'Uniform and non-uniform acceleration, calculus derivations, and v-t graph area.',
        concepts: [
          { id: 'msl-04', name: 'Acceleration & Velocity-Time Graphs', desc: 'Rate of change of velocity dv/dt, physical interpretation of area under v-t graph as displacement.', status: 'locked', prereq: 'msl-03' },
          { id: 'msl-05', name: 'Kinematic Equations of Motion', desc: 'Derivation of v = u + at, s = ut + 0.5at², and v² = u² + 2as under uniform acceleration.', status: 'locked', prereq: 'msl-04' },
        ],
      },
      {
        name: 'Relative Motion & Practical Scenarios',
        description: 'Relative velocity vectors in one dimension, free fall under gravity, and reaction times.',
        concepts: [
          { id: 'msl-06', name: 'Free Fall & Vertical Motion', desc: 'Motion under constant gravitational acceleration g = 9.8 m/s² neglecting aerodynamic drag.', status: 'locked', prereq: 'msl-05' },
          { id: 'msl-07', name: 'Relative Velocity & Stopping Distance', desc: 'Relative velocity v_AB = v_A - v_B, braking distances, and human reaction time analysis.', status: 'locked', prereq: 'msl-06' },
        ],
      },
    ],
  },
};

// Procedural realistic topic generator for any chapter not pre-seeded above
function generateDefaultTopicsForChapter(chapterId: string, chapterName: string): Array<{ name: string; description: string; concepts: Array<{ id: string; name: string; desc: string; status?: ConceptNodeStatus; prereq?: string }> }> {
  return [
    {
      name: 'Foundations & Core Principles',
      description: `Fundamental definitions and baseline theories of ${chapterName}.`,
      concepts: [
        {
          id: `${chapterId}-c01`,
          name: 'Fundamental Axioms & Definitions',
          desc: `Core nomenclature, basic observations, and foundational axioms of ${chapterName}.`,
          status: 'mastered',
        },
        {
          id: `${chapterId}-c02`,
          name: 'Analytical Equations & Models',
          desc: `Mathematical representations and structured analytical models governing the concepts.`,
          status: 'mastered',
          prereq: `${chapterId}-c01`,
        },
      ],
    },
    {
      name: 'Mechanisms & Systematic Analysis',
      description: 'Deeper qualitative mechanisms and step-by-step problem formulations.',
      concepts: [
        {
          id: `${chapterId}-c03`,
          name: 'Core Mechanistic Pathways',
          desc: 'Understanding sequential causal steps, transformations, and physical behavior.',
          status: 'available',
          prereq: `${chapterId}-c02`,
        },
        {
          id: `${chapterId}-c04`,
          name: 'Comparative Dynamics & Properties',
          desc: 'Contrasting distinct cases, boundary conditions, and experimental evidence.',
          status: 'locked',
          prereq: `${chapterId}-c03`,
        },
        {
          id: `${chapterId}-c05`,
          name: 'Parametric Variation & Proofs',
          desc: 'Evaluating dependence on state variables, algebraic derivations, and validation.',
          status: 'locked',
          prereq: `${chapterId}-c04`,
        },
      ],
    },
    {
      name: 'Advanced Synthesis & Real Applications',
      description: 'Higher-order synthesis, problem solving, and practical real-world utilization.',
      concepts: [
        {
          id: `${chapterId}-c06`,
          name: 'Practical Systems & Engineering',
          desc: 'Contemporary implementations, technological devices, and environmental relevance.',
          status: 'locked',
          prereq: `${chapterId}-c05`,
        },
        {
          id: `${chapterId}-c07`,
          name: 'Mastery Synthesis & Complex Scenarios',
          desc: 'Multidisciplinary synthesis combining all chapter components for advanced reasoning.',
          status: 'locked',
          prereq: `${chapterId}-c06`,
        },
      ],
    },
  ];
}

export const constellationService = {
  /**
   * Get the full constellation topic & node tree for a chapter
   */
  async getChapterConstellation(subjectId: string, chapterId: string, chapterName: string): Promise<ChapterConstellation> {
    const storageKey = `${STORAGE_PREFIX}${subjectId}_${chapterId}`;
    
    // Check local storage for persistent student progress
    let raw = localStorage.getItem(storageKey);
    let stateMap: Record<string, ConceptNodeStatus> = {};
    if (raw) {
      try {
        stateMap = JSON.parse(raw);
      } catch {
        stateMap = {};
      }
    }

    const rawData = CURRICULUM_CONSTELLATIONS[chapterId] || {
      topics: generateDefaultTopicsForChapter(chapterId, chapterName),
    };

    let globalOrder = 1;
    let conceptLookup: Record<string, string> = {};

    // First pass: collect concept names for prerequisite labelling
    rawData.topics.forEach((t) => {
      t.concepts.forEach((c) => {
        conceptLookup[c.id] = c.name;
      });
    });

    const topics: TopicGroup[] = rawData.topics.map((t, tIdx) => {
      const concepts: ConceptNode[] = t.concepts.map((c) => {
        // Saved status overrides default if user modified it (timer/requested converted to locked)
        const rawSaved = stateMap[c.id];
        const savedStatus = rawSaved === 'requested' ? 'locked' : rawSaved;
        const fallbackStatus = c.status === 'requested' ? 'locked' : c.status;
        const status: ConceptNodeStatus = savedStatus || fallbackStatus || 'locked';

        const node: ConceptNode = {
          id: c.id,
          order: globalOrder++,
          name: c.name,
          short_description: c.desc,
          status,
          topic_id: `topic-${tIdx + 1}`,
          topic_number: tIdx + 1,
          topic_name: t.name,
          prerequisite_id: c.prereq || null,
          prerequisite_name: c.prereq ? conceptLookup[c.prereq] : undefined,
          video_duration: '6 mins',
          feynman_cleared: status === 'mastered',
          target_language: undefined,
        };

        return node;
      });

      return {
        id: `topic-${tIdx + 1}`,
        topic_number: tIdx + 1,
        name: t.name,
        description: t.description,
        concepts,
      };
    });

    let totalConcepts = 0;
    let masteredConcepts = 0;

    topics.forEach((t) => {
      t.concepts.forEach((c) => {
        totalConcepts++;
        if (c.status === 'mastered') masteredConcepts++;
      });
    });

    return {
      chapter_id: chapterId,
      subject_id: subjectId,
      chapter_number: 1,
      chapter_name: chapterName,
      total_concepts: totalConcepts,
      mastered_concepts: masteredConcepts,
      topics,
    };
  },

  /**
   * Mark a node as mastered, unlock dependent nodes, and persist to storage
   */
  async setConceptMastered(subjectId: string, chapterId: string, conceptId: string): Promise<ChapterConstellation> {
    const storageKey = `${STORAGE_PREFIX}${subjectId}_${chapterId}`;
    let stateMap: Record<string, ConceptNodeStatus> = {};
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) stateMap = JSON.parse(raw);
    } catch {
      stateMap = {};
    }

    // Set target to mastered
    stateMap[conceptId] = 'mastered';

    // Retrieve current data to find prerequisites that can now be unlocked
    const current = await this.getChapterConstellation(subjectId, chapterId, '');
    
    // Find all nodes that had conceptId as their prerequisite
    current.topics.forEach((t) => {
      t.concepts.forEach((c) => {
        if (c.prerequisite_id === conceptId && stateMap[c.id] !== 'mastered') {
          // If was locked, unlock to available!
          if (c.status === 'locked' || !stateMap[c.id]) {
            stateMap[c.id] = 'available';
          }
        }
      });
    });

    localStorage.setItem(storageKey, JSON.stringify(stateMap));
    return this.getChapterConstellation(subjectId, chapterId, current.chapter_name);
  },

  /**
   * Reset chapter constellation progress (utility for students to restart journey)
   */
  async resetChapterConstellation(subjectId: string, chapterId: string): Promise<void> {
    const storageKey = `${STORAGE_PREFIX}${subjectId}_${chapterId}`;
    localStorage.removeItem(storageKey);
  },
};
