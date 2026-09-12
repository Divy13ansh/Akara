/**
 * Akara Multilingual Knowledge Repository Data Service
 * 
 * Manages the entire curriculum repository across all subjects, domains, and languages.
 * Provides repository discovery, full search, language coverage statistics,
 * global generated video counts, and cross-references personal student progress.
 */

import { diagnosticService } from './diagnosticData';
import { ConceptNodeStatus } from './constellationData';

export type MasteryProgressState = 'mastered' | 'needs-revisit' | 'available' | 'locked';

export interface LibraryConcept {
  id: string;
  name: string;
  shortDescription: string;
  subjectId: string;
  subjectName: string;
  domain: string; // e.g. "Chemistry", "Biology", "Physics", "Algebra", "Geometry", "Trigonometry", "Number Systems", "Statistics & Probability"
  chapterId: string;
  chapterName: string;
  topicName: string;
  class: number;
  order: number;
  availableLanguages: string[]; // ISO language codes: 'hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'
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
    full: number;     // 12 languages
    high: number;     // 8-11 languages
    moderate: number; // 4-7 languages
    low: number;      // 1-3 languages
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

const ALL_SUPPORTED_LANGUAGES = ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'];

// Canonical repository concepts across all subjects & branches
interface RawRepositoryItem {
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
  languages: string[];
  durationMinutes: number;
  defaultProgress: MasteryProgressState;
  prereqId?: string;
  prereqName?: string;
}

const RAW_REPOSITORY_CATALOG: RawRepositoryItem[] = [
  // ==========================================
  // SCIENCE: CHEMISTRY
  // ==========================================
  {
    id: 'cr-01',
    name: 'Chemical Changes & Word Equations',
    shortDescription: 'Observing state transformations, evolution of gas, temperature variations, and writing foundational word equations.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Chemical Equations & Balancing',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 12,
    defaultProgress: 'mastered',
  },
  {
    id: 'cr-02',
    name: 'Balancing Chemical Equations',
    shortDescription: 'Systematic stoichiometric balancing of reactants and products ensuring atom conservation without modifying formulas.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Chemical Equations & Balancing',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 15,
    defaultProgress: 'needs-revisit',
    prereqId: 'cr-01',
    prereqName: 'Chemical Changes & Word Equations',
  },
  {
    id: 'cr-03',
    name: 'Law of Conservation of Mass',
    shortDescription: 'Verifying that total mass remains conserved throughout closed chemical transformations and nuclear-free reactions.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Chemical Equations & Balancing',
    class: 10,
    order: 3,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 11,
    defaultProgress: 'mastered',
    prereqId: 'cr-02',
    prereqName: 'Balancing Chemical Equations',
  },
  {
    id: 'cr-04',
    name: 'Combination & Exothermic Reactions',
    shortDescription: 'Reactions where two or more substances combine into a single product with substantial release of thermal energy.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Types of Chemical Reactions',
    class: 10,
    order: 4,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa'], // 10 languages
    durationMinutes: 13,
    defaultProgress: 'mastered',
    prereqId: 'cr-03',
    prereqName: 'Law of Conservation of Mass',
  },
  {
    id: 'cr-05',
    name: 'Decomposition Reactions',
    shortDescription: 'Thermal, electrolytic, and photolytic breakdown of complex compounds into simpler constituent elemental substances.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Types of Chemical Reactions',
    class: 10,
    order: 5,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa'], // 10 languages
    durationMinutes: 14,
    defaultProgress: 'mastered',
    prereqId: 'cr-04',
    prereqName: 'Combination & Exothermic Reactions',
  },
  {
    id: 'cr-06',
    name: 'Displacement Reactions & Activity Series',
    shortDescription: 'Single displacement reactions governed strictly by the electrochemical reactivity series of metals.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Types of Chemical Reactions',
    class: 10,
    order: 6,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn'], // 8 languages
    durationMinutes: 12,
    defaultProgress: 'available',
    prereqId: 'cr-05',
    prereqName: 'Decomposition Reactions',
  },
  {
    id: 'cr-07',
    name: 'Double Displacement & Precipitation',
    shortDescription: 'Mutual exchange of cations and anions between aqueous solutions yielding insoluble precipitates.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Types of Chemical Reactions',
    class: 10,
    order: 7,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta'], // 6 languages
    durationMinutes: 13,
    defaultProgress: 'locked',
    prereqId: 'cr-06',
    prereqName: 'Displacement Reactions & Activity Series',
  },
  {
    id: 'cr-08',
    name: 'Oxidation and Reduction (Redox)',
    shortDescription: 'Simultaneous loss and gain of oxygen, hydrogen, or electrons in inorganic and organic reactions.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'chemical-reactions',
    chapterName: 'Chemical Reactions and Equations',
    topicName: 'Redox Reactions & Daily Life',
    class: 10,
    order: 8,
    languages: ['hi', 'en', 'mr', 'bn'], // 4 languages
    durationMinutes: 16,
    defaultProgress: 'locked',
    prereqId: 'cr-07',
    prereqName: 'Double Displacement & Precipitation',
  },
  {
    id: 'abs-01',
    name: 'Indicators & Chemical Properties of Acids',
    shortDescription: 'Litmus, synthetic indicators, olfactory sensors, and reaction of acids with active metallic elements.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'acids-bases-salts',
    chapterName: 'Acids, Bases and Salts',
    topicName: 'Properties of Acids and Bases',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 14,
    defaultProgress: 'mastered',
  },
  {
    id: 'abs-04',
    name: 'Understanding the Logarithmic pH Scale',
    shortDescription: 'The 0-14 logarithmic scale measuring hydronium ion concentration in aqueous biological and chemical systems.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'acids-bases-salts',
    chapterName: 'Acids, Bases and Salts',
    topicName: 'pH Scale & Daily Applications',
    class: 10,
    order: 4,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml'], // 9 languages
    durationMinutes: 15,
    defaultProgress: 'available',
    prereqId: 'abs-01',
    prereqName: 'Indicators & Chemical Properties of Acids',
  },
  {
    id: 'abs-06',
    name: 'Bleaching Powder, Baking Soda & Plaster of Paris',
    shortDescription: 'Preparation, chemical formulas, water of crystallization, and everyday applications of commercial salts.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'acids-bases-salts',
    chapterName: 'Acids, Bases and Salts',
    topicName: 'Salts & Chlor-Alkali Process',
    class: 10,
    order: 6,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 16,
    defaultProgress: 'available',
  },
  {
    id: 'mnm-01',
    name: 'Physical & Chemical Properties of Metals',
    shortDescription: 'Malleability, ductility, sonority, amphoteric oxide formation, and reactions with cold/hot water.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'metals-non-metals',
    chapterName: 'Metals and Non-metals',
    topicName: 'Physical & Chemical Properties',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 14,
    defaultProgress: 'available',
  },
  {
    id: 'mnm-02',
    name: 'Reactivity Series & Metallurgy Extraction',
    shortDescription: 'Displacement series, roasting vs calcination, and electrolytic refining of metals.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'metals-non-metals',
    chapterName: 'Metals and Non-metals',
    topicName: 'Reactivity Series & Metallurgy',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 15,
    defaultProgress: 'available',
  },
  {
    id: 'cc-01',
    name: 'Covalent Bonding & Tetravalency of Carbon',
    shortDescription: 'Electron sharing, versatile catenation bonding, and carbon allotropes (diamond, graphite, fullerenes).',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'carbon-compounds',
    chapterName: 'Carbon and its Compounds',
    topicName: 'Bonding in Carbon & Catenation',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 14,
    defaultProgress: 'available',
  },
  {
    id: 'cc-02',
    name: 'Hydrocarbons, Functional Groups & Homologous Series',
    shortDescription: 'Alkanes, alkenes, alkynes, functional groups (alcohols, aldehydes, carboxylic acids), and IUPAC nomenclature.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'carbon-compounds',
    chapterName: 'Carbon and its Compounds',
    topicName: 'Hydrocarbons & Functional Groups',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 16,
    defaultProgress: 'available',
  },
  {
    id: 'cc-03',
    name: 'Chemical Properties of Carbon Compounds & Soaps',
    shortDescription: 'Combustion, oxidation, addition reactions, and micelle cleansing mechanism of soaps in hard water.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Chemistry',
    chapterId: 'carbon-compounds',
    chapterName: 'Carbon and its Compounds',
    topicName: 'Chemical Properties & Soaps',
    class: 10,
    order: 3,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 15,
    defaultProgress: 'available',
  },

  // ==========================================
  // SCIENCE: BIOLOGY
  // ==========================================
  {
    id: 'bio-01',
    name: 'Cellular Photosynthesis & Chloroplasts',
    shortDescription: 'Light-dependent and Calvin cycle dark reactions transforming radiant solar energy into stored glucose.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'life-processes',
    chapterName: 'Life Processes',
    topicName: 'Autotrophic Nutrition',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 16,
    defaultProgress: 'mastered',
  },
  {
    id: 'bio-02',
    name: 'Human Alimentary Canal & Digestion',
    shortDescription: 'Sequential enzymatic breakdown of carbohydrates, proteins, and emulsified lipids from mouth to ileum.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'life-processes',
    chapterName: 'Life Processes',
    topicName: 'Heterotrophic Nutrition',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 18,
    defaultProgress: 'mastered',
  },
  {
    id: 'bio-03',
    name: 'Respiration: Aerobic vs Anaerobic Glycolysis',
    shortDescription: 'Cytoplasmic glycolysis followed by mitochondrial Krebs cycle ATP generation vs lactic acid fermentation.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'life-processes',
    chapterName: 'Life Processes',
    topicName: 'Cellular Respiration',
    class: 10,
    order: 3,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa'], // 10 languages
    durationMinutes: 14,
    defaultProgress: 'mastered',
  },
  {
    id: 'bio-04',
    name: 'Human Circulatory System & Double Circulation',
    shortDescription: 'Four-chambered heart anatomy, systemic vs pulmonary loops, and oxygenated blood separation.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'life-processes',
    chapterName: 'Life Processes',
    topicName: 'Transportation in Animals',
    class: 10,
    order: 4,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn'], // 8 languages
    durationMinutes: 17,
    defaultProgress: 'available',
  },
  {
    id: 'bio-05',
    name: 'Nephron Filtration Mechanics & Excretion',
    shortDescription: 'Glomerular ultrafiltration, tubular selective reabsorption, and urine concentration in human kidneys.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'life-processes',
    chapterName: 'Life Processes',
    topicName: 'Excretion in Humans',
    class: 10,
    order: 5,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta'], // 6 languages
    durationMinutes: 15,
    defaultProgress: 'locked',
  },
  {
    id: 'bio-06',
    name: 'Reflex Arcs & Synaptic Transmission',
    shortDescription: 'Sensory neuron afferent pathways, spinal cord interneurons, motor efferent response, and neurotransmitters.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'control-coordination',
    chapterName: 'Control and Coordination',
    topicName: 'Nervous System',
    class: 10,
    order: 1,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu'], // 7 languages
    durationMinutes: 13,
    defaultProgress: 'locked',
  },
  {
    id: 'rep-01',
    name: 'Asexual Reproduction: Fission, Budding & Regeneration',
    shortDescription: 'Binary fission in Amoeba, multiple fission in Plasmodium, yeast budding, and Planaria cell regeneration.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'reproduction-organisms',
    chapterName: 'How do Organisms Reproduce?',
    topicName: 'Modes of Asexual Reproduction',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 13,
    defaultProgress: 'available',
  },
  {
    id: 'rep-02',
    name: 'Sexual Reproduction in Flowering Plants',
    shortDescription: 'Flower anatomy (stamens, carpels), pollination mechanisms, pollen tube germination, and double fertilization.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'reproduction-organisms',
    chapterName: 'How do Organisms Reproduce?',
    topicName: 'Plant Sexual Reproduction',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 15,
    defaultProgress: 'available',
  },
  {
    id: 'rep-03',
    name: 'Human Reproductive Systems & Health',
    shortDescription: 'Male and female anatomy, 28-day menstrual cycle, fertilization in fallopian tubes, and contraception methods.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'reproduction-organisms',
    chapterName: 'How do Organisms Reproduce?',
    topicName: 'Human Reproduction & Health',
    class: 10,
    order: 3,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 16,
    defaultProgress: 'available',
  },
  {
    id: 'bio-07',
    name: 'Mendel’s Laws of Monohybrid Inheritance',
    shortDescription: 'Dominant vs recessive alleles, Punnett squares, phenotype vs genotype ratios in Pisum sativum experiments.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Biology',
    chapterId: 'heredity',
    chapterName: 'Heredity and Evolution',
    topicName: 'Genetics & Inheritance',
    class: 10,
    order: 1,
    languages: ['hi', 'en', 'mr', 'bn'], // 4 languages
    durationMinutes: 19,
    defaultProgress: 'locked',
  },

  // ==========================================
  // SCIENCE: PHYSICS
  // ==========================================
  {
    id: 'phy-01',
    name: 'Laws of Reflection & Spherical Mirrors',
    shortDescription: 'Focal length, center of curvature, principal axis, and ray diagrams for concave and convex spherical mirrors.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'light-reflection-refraction',
    chapterName: 'Light: Reflection and Refraction',
    topicName: 'Reflection of Light',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 16,
    defaultProgress: 'mastered',
  },
  {
    id: 'phy-02',
    name: 'Mirror Formula & Cartesion Sign Convention',
    shortDescription: 'Mathematical relationship between focal length, object distance, image distance, and linear magnification.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'light-reflection-refraction',
    chapterName: 'Light: Reflection and Refraction',
    topicName: 'Reflection of Light',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 14,
    defaultProgress: 'needs-revisit',
    prereqId: 'phy-01',
    prereqName: 'Laws of Reflection & Spherical Mirrors',
  },
  {
    id: 'phy-03',
    name: 'Refraction of Light & Snell’s Law',
    shortDescription: 'Wave speed deceleration across optical interfaces, angle of incidence, and constant ratio of sines.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'light-reflection-refraction',
    chapterName: 'Light: Reflection and Refraction',
    topicName: 'Refraction of Light',
    class: 10,
    order: 3,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa'], // 10 languages
    durationMinutes: 15,
    defaultProgress: 'mastered',
    prereqId: 'phy-02',
    prereqName: 'Mirror Formula & Cartesion Sign Convention',
  },
  {
    id: 'phy-04',
    name: 'Lens Formula & Power of an Optical Lens',
    shortDescription: 'Thin lens equation, reciprocal focal length in diopters, and corrective optometry principles.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'light-reflection-refraction',
    chapterName: 'Light: Reflection and Refraction',
    topicName: 'Refraction through Lenses',
    class: 10,
    order: 4,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn'], // 8 languages
    durationMinutes: 13,
    defaultProgress: 'available',
    prereqId: 'phy-03',
    prereqName: 'Refraction of Light & Snell’s Law',
  },
  {
    id: 'he-01',
    name: 'Anatomy of Human Eye & Accommodation',
    shortDescription: 'Cornea, pupil, crystalline lens, ciliary muscles accommodating focal length, and retina image formation.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'human-eye',
    chapterName: 'Human Eye and Colourful World',
    topicName: 'Structure of the Human Eye',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 13,
    defaultProgress: 'available',
  },
  {
    id: 'he-02',
    name: 'Defects of Vision: Myopia & Hypermetropia',
    shortDescription: 'Near-sightedness and far-sightedness causes, optical ray diagrams, and corrective concave/convex lens formulas.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'human-eye',
    chapterName: 'Human Eye and Colourful World',
    topicName: 'Defects of Vision & Corrections',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 15,
    defaultProgress: 'available',
  },
  {
    id: 'he-03',
    name: 'Prism Dispersion & Atmospheric Refraction',
    shortDescription: 'White light VIBGYOR splitting through a glass prism, twinkling of stars, advanced sunrise, and rainbow physics.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'human-eye',
    chapterName: 'Human Eye and Colourful World',
    topicName: 'Prism Dispersion & Atmospheric Optics',
    class: 10,
    order: 3,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 14,
    defaultProgress: 'available',
  },
  {
    id: 'phy-05',
    name: 'Electric Current, Potential & Ohm’s Law',
    shortDescription: 'Coulombs per second, electromotive force, and linear proportional voltage-to-current resistance relationships.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'electricity',
    chapterName: 'Electricity',
    topicName: 'Ohm’s Law & Resistance',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 18,
    defaultProgress: 'mastered',
  },
  {
    id: 'phy-06',
    name: 'Resistors in Series and Parallel Networks',
    shortDescription: 'Equivalent resistance derivation, Kirchhoff voltage drops in series, and current division in parallel branches.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'electricity',
    chapterName: 'Electricity',
    topicName: 'Circuit Topologies',
    class: 10,
    order: 2,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml'], // 9 languages
    durationMinutes: 16,
    defaultProgress: 'available',
    prereqId: 'phy-05',
    prereqName: 'Electric Current, Potential & Ohm’s Law',
  },
  {
    id: 'phy-07',
    name: 'Joule’s Law of Heating & Electrical Power',
    shortDescription: 'Thermal dissipation proportional to square of current, resistance, and time in domestic appliances.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'electricity',
    chapterName: 'Electricity',
    topicName: 'Heating Effect of Current',
    class: 10,
    order: 3,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta'], // 6 languages
    durationMinutes: 12,
    defaultProgress: 'locked',
    prereqId: 'phy-06',
    prereqName: 'Resistors in Series and Parallel Networks',
  },
  {
    id: 'phy-08',
    name: 'Magnetic Field Lines & Fleming’s Left-Hand Rule',
    shortDescription: 'Concentric magnetic field lines around straight conductors and Lorentz force vectors in electric motors.',
    subjectId: 'science',
    subjectName: 'Science',
    domain: 'Physics',
    chapterId: 'magnetic-effects',
    chapterName: 'Magnetic Effects of Electric Current',
    topicName: 'Magnetic Fields & Force',
    class: 10,
    order: 1,
    languages: ['hi', 'en', 'mr', 'bn', 'te'], // 5 languages
    durationMinutes: 15,
    defaultProgress: 'locked',
  },

  // ==========================================
  // MATHEMATICS: NUMBER SYSTEMS & ARITHMETIC
  // ==========================================
  {
    id: 'math-01',
    name: 'Euclid’s Division Lemma & Algorithm',
    shortDescription: 'Fundamental division theorem a = bq + r (0 <= r < b) and computing Highest Common Factor of large integers.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Number Systems',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: 'Euclidean Division',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 14,
    defaultProgress: 'mastered',
  },
  {
    id: 'math-02',
    name: 'The Fundamental Theorem of Arithmetic',
    shortDescription: 'Every composite integer can be expressed uniquely as a product of prime powers irrespective of factor order.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Number Systems',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: 'Prime Factorization',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 13,
    defaultProgress: 'needs-revisit',
    prereqId: 'math-01',
    prereqName: 'Euclid’s Division Lemma & Algorithm',
  },
  {
    id: 'math-03',
    name: 'Proof of Irrationality for Square Roots',
    shortDescription: 'Proof by contradiction demonstrating that square roots of prime numbers cannot equal p/q integers.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Number Systems',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: 'Irrational Numbers',
    class: 10,
    order: 3,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa'], // 10 languages
    durationMinutes: 15,
    defaultProgress: 'mastered',
    prereqId: 'math-02',
    prereqName: 'The Fundamental Theorem of Arithmetic',
  },
  {
    id: 'math-04',
    name: 'Decimal Expansion of Rational Numbers',
    shortDescription: 'Characterizing terminating vs non-terminating repeating decimals by prime factors 2^n * 5^m in the denominator.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Number Systems',
    chapterId: 'real-numbers',
    chapterName: 'Real Numbers',
    topicName: 'Rational Numbers',
    class: 10,
    order: 4,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn'], // 8 languages
    durationMinutes: 11,
    defaultProgress: 'available',
    prereqId: 'math-03',
    prereqName: 'Proof of Irrationality for Square Roots',
  },
  {
    id: 'math-05',
    name: 'Arithmetic Progression: nth Term Formula',
    shortDescription: 'Sequence with constant common difference d, recursive definition, and general formula an = a + (n - 1)d.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Arithmetic',
    chapterId: 'arithmetic-progressions',
    chapterName: 'Arithmetic Progressions',
    topicName: 'AP Formulas',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 13,
    defaultProgress: 'mastered',
  },
  {
    id: 'math-06',
    name: 'Sum of First n Terms of an AP',
    shortDescription: 'Gauss summation method derivation Sn = n/2 [2a + (n - 1)d] with real-life finance and series applications.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Arithmetic',
    chapterId: 'arithmetic-progressions',
    chapterName: 'Arithmetic Progressions',
    topicName: 'AP Summations',
    class: 10,
    order: 2,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml'], // 9 languages
    durationMinutes: 14,
    defaultProgress: 'available',
    prereqId: 'math-05',
    prereqName: 'Arithmetic Progression: nth Term Formula',
  },

  // ==========================================
  // MATHEMATICS: ALGEBRA
  // ==========================================
  {
    id: 'math-07',
    name: 'Geometrical Meaning of Zeros of a Polynomial',
    shortDescription: 'Connecting x-axis graph intersections of linear, quadratic, and cubic curves to real polynomial roots.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Algebra',
    chapterId: 'polynomials',
    chapterName: 'Polynomials',
    topicName: 'Polynomial Geometry',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 15,
    defaultProgress: 'mastered',
  },
  {
    id: 'math-08',
    name: 'Relationship Between Zeros and Coefficients',
    shortDescription: 'Vieta’s formulas for sum (alpha + beta = -b/a) and product (alpha * beta = c/a) of quadratic polynomial roots.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Algebra',
    chapterId: 'polynomials',
    chapterName: 'Polynomials',
    topicName: 'Algebraic Relations',
    class: 10,
    order: 2,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa'], // 10 languages
    durationMinutes: 14,
    defaultProgress: 'mastered',
    prereqId: 'math-07',
    prereqName: 'Geometrical Meaning of Zeros of a Polynomial',
  },
  {
    id: 'math-09',
    name: 'Graphical Method of Solving Linear Systems',
    shortDescription: 'Intersecting (unique solution), coincident (infinite solutions), and parallel (inconsistent) line topologies.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Algebra',
    chapterId: 'linear-equations',
    chapterName: 'Pair of Linear Equations in Two Variables',
    topicName: 'Linear Systems',
    class: 10,
    order: 1,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn'], // 8 languages
    durationMinutes: 16,
    defaultProgress: 'available',
  },
  {
    id: 'math-10',
    name: 'Quadratic Formula & Nature of Roots (Discriminant)',
    shortDescription: 'D = b^2 - 4ac behavior: two distinct real roots (D > 0), two equal roots (D = 0), and no real roots (D < 0).',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Algebra',
    chapterId: 'quadratic-equations',
    chapterName: 'Quadratic Equations',
    topicName: 'Quadratic Solutions',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 17,
    defaultProgress: 'mastered',
  },

  // ==========================================
  // MATHEMATICS: GEOMETRY & COORDINATES
  // ==========================================
  {
    id: 'math-11',
    name: 'Basic Proportionality Theorem (Thales’ Theorem)',
    shortDescription: 'Line drawn parallel to one side of a triangle divides the other two sides in the exact same proportion.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Geometry',
    chapterId: 'triangles',
    chapterName: 'Triangles',
    topicName: 'Triangle Proportionality',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 18,
    defaultProgress: 'mastered',
  },
  {
    id: 'math-12',
    name: 'Criteria for Similarity of Triangles (AAA, SAS, SSS)',
    shortDescription: 'Proving equiangularity and proportional corresponding sides between geometric planar triangles.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Geometry',
    chapterId: 'triangles',
    chapterName: 'Triangles',
    topicName: 'Similarity Criteria',
    class: 10,
    order: 2,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu'], // 7 languages
    durationMinutes: 15,
    defaultProgress: 'available',
    prereqId: 'math-11',
    prereqName: 'Basic Proportionality Theorem (Thales’ Theorem)',
  },
  {
    id: 'math-13',
    name: 'Tangents from an External Point Theorem',
    shortDescription: 'The lengths of tangents drawn from an external point to a circle are equal and subtend equal angles at the center.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Geometry',
    chapterId: 'circles',
    chapterName: 'Circles',
    topicName: 'Circle Tangents',
    class: 10,
    order: 1,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta'], // 6 languages
    durationMinutes: 13,
    defaultProgress: 'locked',
  },
  {
    id: 'math-14',
    name: 'Distance & Section Formulas in Coordinates',
    shortDescription: 'Euclidean distance sqrt((x2-x1)^2 + (y2-y1)^2) and internal section m1x2+m2x1 / (m1+m2) Cartesian coordinates.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Geometry',
    chapterId: 'coordinate-geometry',
    chapterName: 'Coordinate Geometry',
    topicName: 'Coordinate Formulas',
    class: 10,
    order: 1,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml'], // 9 languages
    durationMinutes: 14,
    defaultProgress: 'mastered',
  },

  // ==========================================
  // MATHEMATICS: TRIGONOMETRY
  // ==========================================
  {
    id: 'math-15',
    name: 'Trigonometric Ratios of Acute Angles',
    shortDescription: 'Defining sine, cosine, tangent, cosecant, secant, and cotangent in right-angled triangles.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Trigonometry',
    chapterId: 'trigonometry-intro',
    chapterName: 'Introduction to Trigonometry',
    topicName: 'Trig Fundamentals',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 16,
    defaultProgress: 'mastered',
  },
  {
    id: 'math-16',
    name: 'Pythagorean Trigonometric Identities',
    shortDescription: 'Deriving sin^2 theta + cos^2 theta = 1, 1 + tan^2 theta = sec^2 theta, and algebraic transformations.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Trigonometry',
    chapterId: 'trigonometry-intro',
    chapterName: 'Introduction to Trigonometry',
    topicName: 'Trigonometric Identities',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 17,
    defaultProgress: 'available',
    prereqId: 'math-15',
    prereqName: 'Trigonometric Ratios of Acute Angles',
  },
  {
    id: 'math-17',
    name: 'Heights & Distances: Angles of Elevation & Depression',
    shortDescription: 'Surveying problems, line-of-sight geometry, and practical trigonometric navigation applications.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Trigonometry',
    chapterId: 'applications-trigonometry',
    chapterName: 'Some Applications of Trigonometry',
    topicName: 'Trigonometry Applications',
    class: 10,
    order: 1,
    languages: ['hi', 'en', 'mr', 'bn', 'te'], // 5 languages
    durationMinutes: 15,
    defaultProgress: 'locked',
    prereqId: 'math-16',
    prereqName: 'Pythagorean Trigonometric Identities',
  },
  {
    id: 'math-arc-01',
    name: 'Perimeter & Area of Circular Sectors',
    shortDescription: 'Arc length theta/360 * 2*pi*r and sector area theta/360 * pi*r^2 calculations in degrees.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Geometry',
    chapterId: 'areas-circles',
    chapterName: 'Areas Related to Circles',
    topicName: 'Sectors of Circles',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 14,
    defaultProgress: 'available',
  },
  {
    id: 'math-arc-02',
    name: 'Areas of Segment & Shaded Composite Shapes',
    shortDescription: 'Subtracting triangular areas from circular sectors to determine major and minor segments and shaded designs.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Geometry',
    chapterId: 'areas-circles',
    chapterName: 'Areas Related to Circles',
    topicName: 'Segments & Shaded Regions',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 16,
    defaultProgress: 'available',
  },
  {
    id: 'math-sav-01',
    name: 'Surface Area of Combinations of Solids',
    shortDescription: 'Curved surface areas of combined geometric shapes: cones atop cylinders, hemispheres on prisms.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Geometry',
    chapterId: 'surface-areas-volumes',
    chapterName: 'Surface Areas and Volumes',
    topicName: 'Surface Area of Combined Solids',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 15,
    defaultProgress: 'available',
  },
  {
    id: 'math-sav-02',
    name: 'Volume of Combined Solids & Conversion of Shape',
    shortDescription: 'Conservation of volume during metallurgical melting, remolding cylinders into spheres, and embankment problems.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Geometry',
    chapterId: 'surface-areas-volumes',
    chapterName: 'Surface Areas and Volumes',
    topicName: 'Volume of Combined Solids',
    class: 10,
    order: 2,
    languages: ALL_SUPPORTED_LANGUAGES,
    durationMinutes: 16,
    defaultProgress: 'available',
  },

  // ==========================================
  // MATHEMATICS: STATISTICS & PROBABILITY
  // ==========================================
  {
    id: 'math-18',
    name: 'Mean of Grouped Data (Direct & Assumed Mean)',
    shortDescription: 'Calculating arithmetic mean for frequency distributions using Sigma(fi*xi)/Sigma(fi) and assumed deviation methods.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Statistics & Probability',
    chapterId: 'statistics',
    chapterName: 'Statistics',
    topicName: 'Grouped Measures of Center',
    class: 10,
    order: 1,
    languages: ALL_SUPPORTED_LANGUAGES, // 12 languages
    durationMinutes: 15,
    defaultProgress: 'mastered',
  },
  {
    id: 'math-19',
    name: 'Mode and Median of Grouped Distributions',
    shortDescription: 'Interpolating modal class l + ((f1-f0)/(2f1-f0-f2))*h and cumulative frequency median curves.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Statistics & Probability',
    chapterId: 'statistics',
    chapterName: 'Statistics',
    topicName: 'Grouped Measures of Spread',
    class: 10,
    order: 2,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn'], // 8 languages
    durationMinutes: 16,
    defaultProgress: 'available',
    prereqId: 'math-18',
    prereqName: 'Mean of Grouped Data (Direct & Assumed Mean)',
  },
  {
    id: 'math-20',
    name: 'Classical Theoretical Probability of Events',
    shortDescription: 'Sample spaces, mutually exclusive outcomes, complementary events P(not E) = 1 - P(E), and dice/coin mechanics.',
    subjectId: 'maths',
    subjectName: 'Mathematics',
    domain: 'Statistics & Probability',
    chapterId: 'probability',
    chapterName: 'Probability',
    topicName: 'Theoretical Probability',
    class: 10,
    order: 1,
    languages: ['hi', 'en', 'mr', 'bn', 'te', 'ta'], // 6 languages
    durationMinutes: 12,
    defaultProgress: 'locked',
  },
];

/**
 * Cross-references a raw repository item against current user progress & misconception bank
 */
function resolveStudentProgress(item: RawRepositoryItem): { status: MasteryProgressState; insight?: string } {
  // Check if concept has an active unresolved diagnostic misconception
  const diag = diagnosticService.getDiagnosticForConcept(item.id);
  if (diag && diag.status === 'needs_review') {
    return {
      status: 'needs-revisit',
      insight: diag.diagnosticInsight,
    };
  }

  // Check constellation persistent storage
  try {
    const rawConst = localStorage.getItem('akara_constellation_' + item.chapterId);
    if (rawConst) {
      const parsed = JSON.parse(rawConst);
      for (const topic of parsed.topics || []) {
        const found = (topic.concepts || []).find((c: { id: string; status: string }) => c.id === item.id);
        if (found) {
          if (found.status === 'mastered') return { status: 'mastered' };
          if (found.status === 'available') return { status: 'available' };
          if (found.status === 'locked') return { status: 'locked' };
        }
      }
    }
  } catch {
    // fallback to default
  }

  return { status: item.defaultProgress };
}

export const libraryRepositoryService = {
  /**
   * Fetches all concepts in the repository, resolving personal progress and language stats
   */
  async getConcepts(query?: string, subjectFilter?: string): Promise<LibraryConcept[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/library/concepts.
    // The current results are hardcoded from RAW_REPOSITORY_CATALOG and should come from backend search/browse data.
    await new Promise((resolve) => setTimeout(resolve, 80));

    const cleanQuery = (query || '').trim().toLowerCase();
    const cleanSubj = (subjectFilter || 'all').toLowerCase();

    return RAW_REPOSITORY_CATALOG.filter((item) => {
      // Subject filter
      if (cleanSubj !== 'all') {
        const matchesSubjId = item.subjectId.toLowerCase() === cleanSubj;
        const matchesDomain = item.domain.toLowerCase() === cleanSubj;
        if (!matchesSubjId && !matchesDomain) {
          return false;
        }
      }

      // Query filter
      if (cleanQuery) {
        const matchesName = item.name.toLowerCase().includes(cleanQuery);
        const matchesDesc = item.shortDescription.toLowerCase().includes(cleanQuery);
        const matchesDomain = item.domain.toLowerCase().includes(cleanQuery);
        const matchesChapter = item.chapterName.toLowerCase().includes(cleanQuery);
        const matchesTopic = item.topicName.toLowerCase().includes(cleanQuery);
        return matchesName || matchesDesc || matchesDomain || matchesChapter || matchesTopic;
      }

      return true;
    }).map((item) => {
      const { status, insight } = resolveStudentProgress(item);
      return {
        id: item.id,
        name: item.name,
        shortDescription: item.shortDescription,
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        domain: item.domain,
        chapterId: item.chapterId,
        chapterName: item.chapterName,
        topicName: item.topicName,
        class: item.class,
        order: item.order,
        availableLanguages: item.languages,
        languageCount: item.languages.length,
        totalGeneratedVideos: item.languages.length, // each language provides a dedicated animated explainer
        videoDurationMinutes: item.durationMinutes,
        studentProgress: status,
        diagnosticInsight: insight,
        prerequisiteId: item.prereqId || null,
        prerequisiteName: item.prereqName,
      };
    });
  },

  /**
   * Compiles the hierarchical structure: Subjects -> Domains -> Concepts
   */
  async getSubjectHierarchy(query?: string, subjectFilter?: string): Promise<SubjectSection[]> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/library/hierarchy.
    // The current hierarchical subject/domain/concept grouping is assembled from hardcoded repository data.
    const concepts = await this.getConcepts(query, subjectFilter);
    const cleanSubj = (subjectFilter || 'all').toLowerCase();
    const isDomainBranch = ['physics', 'chemistry', 'biology'].includes(cleanSubj);

    // Group by Subject
    const subjectMap = new Map<string, { name: string; domains: Map<string, LibraryConcept[]> }>();

    concepts.forEach((concept) => {
      const targetSubjId = isDomainBranch ? cleanSubj : concept.subjectId;
      const targetSubjName = isDomainBranch 
        ? (cleanSubj.charAt(0).toUpperCase() + cleanSubj.slice(1))
        : concept.subjectName;

      if (!subjectMap.has(targetSubjId)) {
        subjectMap.set(targetSubjId, {
          name: targetSubjName,
          domains: new Map(),
        });
      }
      const subjEntry = subjectMap.get(targetSubjId)!;
      if (!subjEntry.domains.has(concept.domain)) {
        subjEntry.domains.set(concept.domain, []);
      }
      subjEntry.domains.get(concept.domain)!.push(concept);
    });

    const sections: SubjectSection[] = [];
    subjectMap.forEach((val, subjectId) => {
      const domainGroups: DomainGroup[] = [];
      val.domains.forEach((domConcepts, domainName) => {
        domainGroups.push({
          domainName,
          subjectId,
          subjectName: val.name,
          concepts: domConcepts,
        });
      });

      sections.push({
        subjectId,
        subjectName: val.name,
        totalConcepts: domainGroups.reduce((acc, d) => acc + d.concepts.length, 0),
        domains: domainGroups,
      });
    });

    return sections;
  },

  /**
   * Returns real calculated repository summary including global generated videos count
   */
  async getRepositorySummary(): Promise<LibraryRepositorySummary> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/library/summary.
    // The current summary is generated from the hardcoded RAW_REPOSITORY_CATALOG mock data.
    await new Promise((resolve) => setTimeout(resolve, 50));

    let totalVideos = 0;
    let fullCount = 0;
    let highCount = 0;
    let moderateCount = 0;
    let lowCount = 0;

    RAW_REPOSITORY_CATALOG.forEach((item) => {
      const count = item.languages.length;
      totalVideos += count;
      if (count === 12) fullCount++;
      else if (count >= 8) highCount++;
      else if (count >= 4) moderateCount++;
      else lowCount++;
    });

    const totalConcepts = RAW_REPOSITORY_CATALOG.length;
    const avg = totalConcepts > 0 ? Number((totalVideos / totalConcepts).toFixed(1)) : 0;

    return {
      totalGeneratedVideos: totalVideos,
      totalConcepts,
      totalLanguagesSupported: ALL_SUPPORTED_LANGUAGES.length,
      averageLanguagesPerConcept: avg,
      coverageTiers: {
        full: fullCount,
        high: highCount,
        moderate: moderateCount,
        low: lowCount,
      },
    };
  },

  /**
   * Directly get the live global generated-video counter
   */
  async getGlobalVideoCount(): Promise<number> {
    const summary = await this.getRepositorySummary();
    return summary.totalGeneratedVideos;
  },
};
