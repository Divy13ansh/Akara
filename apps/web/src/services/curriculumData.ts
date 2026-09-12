export interface Subject {
  id: string;
  name: string;
  code: string;
  description: string;
  total_chapters: number;
  total_concepts: number;
  mastered_concepts: number;
}

export interface Chapter {
  id: string;
  subject_id: string;
  chapter_number: number;
  name: string;
  description?: string;
  mastered_concepts: number;
  total_concepts: number;
  class: number;
}

// Subject definitions by class bracket
export function getSubjectsForClass(userClass: number): Subject[] {
  // Classes 11–12: Physics, Chemistry, Biology, Maths (NO Science)
  if (userClass >= 11) {
    return [
      {
        id: 'physics',
        name: 'Physics',
        code: 'PHY',
        description: 'Mechanics, Electromagnetism, Optics and Modern Physics',
        total_chapters: 9,
        total_concepts: 73,
        mastered_concepts: 48,
      },
      {
        id: 'chemistry',
        name: 'Chemistry',
        code: 'CHEM',
        description: 'Physical, Inorganic, and Organic Chemistry fundamentals',
        total_chapters: 8,
        total_concepts: 68,
        mastered_concepts: 46,
      },
      {
        id: 'biology',
        name: 'Biology',
        code: 'BIO',
        description: 'Diversity of Life, Cell Biology, Genetics & Physiology',
        total_chapters: 9,
        total_concepts: 75,
        mastered_concepts: 55,
      },
      {
        id: 'maths',
        name: 'Maths',
        code: 'MATH',
        description: 'Calculus, Vectors, Algebra, Trigonometry & Coordinate Geometry',
        total_chapters: 9,
        total_concepts: 70,
        mastered_concepts: 44,
      },
    ];
  }

  // Classes 6–10: Science, Maths
  return [
    {
      id: 'science',
      name: 'Science',
      code: 'SCI',
      description: 'Physics, Chemistry & Biology principles from NCERT',
      total_chapters: 12,
      total_concepts: 84,
      mastered_concepts: 57,
    },
    {
      id: 'maths',
      name: 'Maths',
      code: 'MATH',
      description: 'Algebra, Geometry, Trigonometry, Statistics & Number Systems',
      total_chapters: 14,
      total_concepts: 81,
      mastered_concepts: 54,
    },
  ];
}

// NCERT chapters by subject & class bracket
export const CHAPTER_DATABASE: Record<string, Chapter[]> = {
  // Class 10 / 6-10 Science
  'science': [
    { id: 'chemical-reactions', subject_id: 'science', chapter_number: 1, name: 'Chemical Reactions and Equations', description: 'Chemical equations, balancing, and major types of chemical reactions.', mastered_concepts: 6, total_concepts: 8, class: 10 },
    { id: 'acids-bases-salts', subject_id: 'science', chapter_number: 2, name: 'Acids, Bases and Salts', description: 'Indicators, pH scale, chemical properties, and essential salt compounds.', mastered_concepts: 5, total_concepts: 7, class: 10 },
    { id: 'metals-non-metals', subject_id: 'science', chapter_number: 3, name: 'Metals and Non-metals', description: 'Physical and chemical properties, reactivity series, and metallurgy.', mastered_concepts: 4, total_concepts: 9, class: 10 },
    { id: 'carbon-compounds', subject_id: 'science', chapter_number: 4, name: 'Carbon and its Compounds', description: 'Covalent bonding, versatile nature of carbon, and functional groups.', mastered_concepts: 3, total_concepts: 8, class: 10 },
    { id: 'life-processes', subject_id: 'science', chapter_number: 5, name: 'Life Processes', description: 'Nutrition, respiration, internal transport, and human excretion systems.', mastered_concepts: 7, total_concepts: 10, class: 10 },
    { id: 'control-coordination', subject_id: 'science', chapter_number: 6, name: 'Control and Coordination', description: 'Nervous system, reflex arcs, and plant and animal hormones.', mastered_concepts: 4, total_concepts: 6, class: 10 },
    { id: 'reproduction-organisms', subject_id: 'science', chapter_number: 7, name: 'How do Organisms Reproduce?', description: 'Asexual and sexual reproduction, flowering plants, and human systems.', mastered_concepts: 5, total_concepts: 7, class: 10 },
    { id: 'heredity', subject_id: 'science', chapter_number: 8, name: 'Heredity and Evolution', description: 'Mendelian inheritance laws, sex determination, and trait variations.', mastered_concepts: 2, total_concepts: 5, class: 10 },
    { id: 'light-reflection-refraction', subject_id: 'science', chapter_number: 9, name: 'Light: Reflection and Refraction', description: 'Spherical mirrors, refractive index, and lens formula calculations.', mastered_concepts: 8, total_concepts: 8, class: 10 },
    { id: 'human-eye', subject_id: 'science', chapter_number: 10, name: 'Human Eye and Colourful World', description: 'Structure of eye, vision defects, prism dispersion, and rainbow formation.', mastered_concepts: 5, total_concepts: 5, class: 10 },
    { id: 'electricity', subject_id: 'science', chapter_number: 11, name: 'Electricity', description: 'Ohm’s law, resistance factors, series-parallel circuits, and Joule’s heating.', mastered_concepts: 7, total_concepts: 9, class: 10 },
    { id: 'magnetic-effects', subject_id: 'science', chapter_number: 12, name: 'Magnetic Effects of Electric Current', description: 'Magnetic field lines, solenoid, electromagnetic induction, and motors.', mastered_concepts: 3, total_concepts: 7, class: 10 },
  ],

  // Maths (Class 6–10)
  'maths': [
    { id: 'real-numbers', subject_id: 'maths', chapter_number: 1, name: 'Real Numbers', description: 'Fundamental theorem of arithmetic and revisiting irrational numbers.', mastered_concepts: 5, total_concepts: 5, class: 10 },
    { id: 'polynomials', subject_id: 'maths', chapter_number: 2, name: 'Polynomials', description: 'Geometric meaning of zeroes and relationship between zeroes & coefficients.', mastered_concepts: 4, total_concepts: 6, class: 10 },
    { id: 'linear-equations', subject_id: 'maths', chapter_number: 3, name: 'Pair of Linear Equations in Two Variables', description: 'Graphical solutions, substitution, and elimination methods.', mastered_concepts: 6, total_concepts: 8, class: 10 },
    { id: 'quadratic-equations', subject_id: 'maths', chapter_number: 4, name: 'Quadratic Equations', description: 'Factorization, quadratic formula, and nature of roots.', mastered_concepts: 5, total_concepts: 7, class: 10 },
    { id: 'arithmetic-progressions', subject_id: 'maths', chapter_number: 5, name: 'Arithmetic Progressions', description: 'nth term derivations and sum of first n terms of an arithmetic progression.', mastered_concepts: 6, total_concepts: 6, class: 10 },
    { id: 'triangles', subject_id: 'maths', chapter_number: 6, name: 'Triangles', description: 'Basic proportionality theorem and criteria for triangle similarity.', mastered_concepts: 4, total_concepts: 8, class: 10 },
    { id: 'coordinate-geometry', subject_id: 'maths', chapter_number: 7, name: 'Coordinate Geometry', description: 'Distance formula and section formula for internal divisions.', mastered_concepts: 5, total_concepts: 5, class: 10 },
    { id: 'trigonometry-intro', subject_id: 'maths', chapter_number: 8, name: 'Introduction to Trigonometry', description: 'Trigonometric ratios, values for specific angles, and basic identities.', mastered_concepts: 7, total_concepts: 9, class: 10 },
    { id: 'applications-trigonometry', subject_id: 'maths', chapter_number: 9, name: 'Some Applications of Trigonometry', description: 'Heights and distances using angles of elevation and depression.', mastered_concepts: 3, total_concepts: 4, class: 10 },
    { id: 'circles', subject_id: 'maths', chapter_number: 10, name: 'Circles', description: 'Tangents to a circle and properties of lengths of tangents from external points.', mastered_concepts: 4, total_concepts: 5, class: 10 },
    { id: 'areas-circles', subject_id: 'maths', chapter_number: 11, name: 'Areas Related to Circles', description: 'Perimeter, area of sector, and segment area of a circle.', mastered_concepts: 3, total_concepts: 5, class: 10 },
    { id: 'surface-areas-volumes', subject_id: 'maths', chapter_number: 12, name: 'Surface Areas and Volumes', description: 'Surface area and volume combinations of solids and shapes.', mastered_concepts: 5, total_concepts: 8, class: 10 },
    { id: 'statistics', subject_id: 'maths', chapter_number: 13, name: 'Statistics', description: 'Mean, median, and mode of grouped frequency distributions.', mastered_concepts: 6, total_concepts: 6, class: 10 },
    { id: 'probability', subject_id: 'maths', chapter_number: 14, name: 'Probability', description: 'Theoretical probability and calculating likelihood of random events.', mastered_concepts: 4, total_concepts: 4, class: 10 },
  ],

  // Physics (Class 11–12)
  'physics': [
    { id: 'units-measurements', subject_id: 'physics', chapter_number: 1, name: 'Units and Measurements', mastered_concepts: 4, total_concepts: 4, class: 11 },
    { id: 'motion-straight-line', subject_id: 'physics', chapter_number: 2, name: 'Motion in a Straight Line', mastered_concepts: 6, total_concepts: 7, class: 11 },
    { id: 'motion-in-plane', subject_id: 'physics', chapter_number: 3, name: 'Motion in a Plane', mastered_concepts: 5, total_concepts: 8, class: 11 },
    { id: 'laws-of-motion', subject_id: 'physics', chapter_number: 4, name: 'Laws of Motion', mastered_concepts: 7, total_concepts: 9, class: 11 },
    { id: 'work-energy-power', subject_id: 'physics', chapter_number: 5, name: 'Work, Energy and Power', mastered_concepts: 6, total_concepts: 8, class: 11 },
    { id: 'rotational-motion', subject_id: 'physics', chapter_number: 6, name: 'System of Particles and Rotational Motion', mastered_concepts: 3, total_concepts: 10, class: 11 },
    { id: 'gravitation', subject_id: 'physics', chapter_number: 7, name: 'Gravitation', mastered_concepts: 5, total_concepts: 7, class: 11 },
    { id: 'electrostatics', subject_id: 'physics', chapter_number: 8, name: 'Electric Charges and Fields', mastered_concepts: 6, total_concepts: 10, class: 12 },
    { id: 'current-electricity', subject_id: 'physics', chapter_number: 9, name: 'Current Electricity', mastered_concepts: 6, total_concepts: 10, class: 12 },
  ],

  // Chemistry (Class 11–12)
  'chemistry': [
    { id: 'basic-concepts-chem', subject_id: 'chemistry', chapter_number: 1, name: 'Some Basic Concepts of Chemistry', mastered_concepts: 5, total_concepts: 6, class: 11 },
    { id: 'structure-of-atom', subject_id: 'chemistry', chapter_number: 2, name: 'Structure of Atom', mastered_concepts: 7, total_concepts: 8, class: 11 },
    { id: 'periodicity-elements', subject_id: 'chemistry', chapter_number: 3, name: 'Classification of Elements and Periodicity', mastered_concepts: 6, total_concepts: 6, class: 11 },
    { id: 'chemical-bonding', subject_id: 'chemistry', chapter_number: 4, name: 'Chemical Bonding and Molecular Structure', mastered_concepts: 8, total_concepts: 10, class: 11 },
    { id: 'thermodynamics', subject_id: 'chemistry', chapter_number: 5, name: 'Thermodynamics', mastered_concepts: 5, total_concepts: 9, class: 11 },
    { id: 'equilibrium', subject_id: 'chemistry', chapter_number: 6, name: 'Equilibrium', mastered_concepts: 4, total_concepts: 8, class: 11 },
    { id: 'organic-principles', subject_id: 'chemistry', chapter_number: 7, name: 'Organic Chemistry: Some Basic Principles', mastered_concepts: 6, total_concepts: 11, class: 11 },
    { id: 'hydrocarbons', subject_id: 'chemistry', chapter_number: 8, name: 'Hydrocarbons', mastered_concepts: 5, total_concepts: 8, class: 11 },
  ],

  // Biology (Class 11–12)
  'biology': [
    { id: 'living-world', subject_id: 'biology', chapter_number: 1, name: 'The Living World', mastered_concepts: 3, total_concepts: 3, class: 11 },
    { id: 'biological-classification', subject_id: 'biology', chapter_number: 2, name: 'Biological Classification', mastered_concepts: 5, total_concepts: 6, class: 11 },
    { id: 'plant-kingdom', subject_id: 'biology', chapter_number: 3, name: 'Plant Kingdom', mastered_concepts: 4, total_concepts: 7, class: 11 },
    { id: 'animal-kingdom', subject_id: 'biology', chapter_number: 4, name: 'Animal Kingdom', mastered_concepts: 6, total_concepts: 8, class: 11 },
    { id: 'morphology-flowering-plants', subject_id: 'biology', chapter_number: 5, name: 'Morphology of Flowering Plants', mastered_concepts: 5, total_concepts: 7, class: 11 },
    { id: 'cell-unit-of-life', subject_id: 'biology', chapter_number: 6, name: 'Cell: The Unit of Life', mastered_concepts: 8, total_concepts: 9, class: 11 },
    { id: 'biomolecules', subject_id: 'biology', chapter_number: 7, name: 'Biomolecules', mastered_concepts: 4, total_concepts: 6, class: 11 },
    { id: 'human-physiology', subject_id: 'biology', chapter_number: 8, name: 'Human Physiology & Breathing', mastered_concepts: 11, total_concepts: 14, class: 11 },
    { id: 'genetics-evolution', subject_id: 'biology', chapter_number: 9, name: 'Principles of Inheritance and Variation', mastered_concepts: 9, total_concepts: 12, class: 12 },
  ],
};
