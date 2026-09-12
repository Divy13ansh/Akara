/**
 * Akara Concept Media & Shared Generation Data Service
 * 
 * Architecture Principle:
 * The video generation pipeline produces a single unified dataset for a concept:
 *   Generated Concept Data
 *   ├── video/audio
 *   ├── script → Concept Card
 *   ├── scene graph → Mind Map
 *   └── script → Quick Quiz
 * 
 * The four practice modes and the Learn/Explain flows are lightweight renderers
 * over this shared generated data.
 */

import { diagnosticService } from './diagnosticData';
import { libraryRepositoryService } from './libraryData';
import { authService } from './api';

export type BackendGenerationStatus = 'instant' | 'finishing_dub' | 'generating_first_time';

export interface GenerationStatusResponse {
  status: BackendGenerationStatus;
  progressPercent: number; // 0 to 100
  currentStage?: string;
  estimatedSecondsRemaining?: number;
  availableLanguages: string[];
  conceptId: string;
  language: string;
}

export interface SceneGraphNode {
  id: string;
  label: string;
  type: 'prerequisite' | 'core' | 'application' | 'extension';
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
  scenario: 'mastery_confirmation' | 'misconception_check';
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
  graphicType: 'equation' | 'diagram' | 'graph' | 'apparatus' | 'reaction';
  formulaOrFormulaSnippet?: string;
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
  
  // Shared Media components
  video: {
    title: string;
    durationSeconds: number;
    durationFormatted: string;
    scenes: VideoScene[];
  };
  script: ConceptScript;
  sceneGraph: SceneGraphData;
  quiz: QuizQuestion[];
  mentorPrompt: MentorPromptData;
}

export interface ExplanationEvaluationResult {
  isMastered: boolean;
  scorePercent: number; // 0 - 100
  feedbackHeadline: string;
  mentorFeedbackText: string;
  pointsCovered: string[];
  pointsMissed: string[];
  diagnosticResolved: boolean;
}

const STORAGE_KEY_GENERATION_CACHE = 'akara_generation_status_cache';

// Load or seed persistent generation statuses
function getStoredStatuses(): Record<string, BackendGenerationStatus> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GENERATION_CACHE);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  // Default seeding: Hindi & English on foundational concepts are 'instant',
  // some regional languages are 'finishing_dub', and certain new ones are 'generating_first_time'
  const initial: Record<string, BackendGenerationStatus> = {
    'cr-01:hi': 'instant',
    'cr-01:en': 'instant',
    'cr-01:mr': 'finishing_dub',
    'cr-02:hi': 'instant',
    'cr-02:en': 'instant',
    'cr-02:ta': 'finishing_dub',
    'rn-01:hi': 'instant',
    'rn-01:en': 'instant',
    'rn-02:hi': 'instant',
    'rn-02:bn': 'finishing_dub',
    'abs-01:hi': 'instant',
  };
  try {
    localStorage.setItem(STORAGE_KEY_GENERATION_CACHE, JSON.stringify(initial));
  } catch {}
  return initial;
}

function saveStoredStatuses(map: Record<string, BackendGenerationStatus>) {
  try {
    localStorage.setItem(STORAGE_KEY_GENERATION_CACHE, JSON.stringify(map));
  } catch {}
}

// Translations for mentor questions across languages
const LOCALIZED_MENTOR_PROMPTS: Record<string, {
  masteryQuestion: string;
  misconceptionQuestion: string;
  explainPromptHeader: string;
  audioLabel: string;
}> = {
  hi: {
    masteryQuestion: 'अपने शब्दों में समझाइए कि रासायनिक समीकरण को संतुलित करते समय द्रव्यमान संरक्षण का नियम कैसे लागू होता है?',
    misconceptionQuestion: 'मैंने देखा कि कुछ छात्र ऑक्सीजन को संतुलित करने के लिए O₂ को O₃ में बदल देते हैं। क्या यह सही है? अपने शब्दों में समझाइए कि यह तरीका गलत क्यों है और सही नियम क्या है?',
    explainPromptHeader: 'अकारा मेंटर',
    audioLabel: 'सुनिए',
  },
  en: {
    masteryQuestion: 'Explain in your own words how the law of conservation of mass applies when balancing a chemical equation.',
    misconceptionQuestion: 'I noticed some students balance oxygen atoms by changing O₂ to O₃. Is this valid? Explain why this violates chemical principles and what should be done instead.',
    explainPromptHeader: 'Akara Mentor',
    audioLabel: 'Listen',
  },
  mr: {
    masteryQuestion: 'रासायनिक समीकरण संतुलित करताना वस्तुमान संवर्धनाचा नियम कसा लागू होतो, हे तुमच्या स्वतःच्या शब्दांत सांगा?',
    misconceptionQuestion: 'काही विद्यार्थी ऑक्सिजन संतुलित करण्यासाठी O₂ चे रूपांतर O₃ मध्ये करतात. हे बरोबर आहे का? हा नियम का चुकीचा आहे ते स्पष्ट करा.',
    explainPromptHeader: 'अकारा मेंटॉर',
    audioLabel: 'ऐका',
  },
  bn: {
    masteryQuestion: 'আপনার নিজের ভাষায় ব্যাখ্যা করুন কীভাবে একটি রাসায়নিক সমীকরণ ভারসাম্যের সময় ভরের নিত্যতা সূত্র প্রযোজ্য হয়?',
    misconceptionQuestion: 'কিছু ছাত্র অক্সিজেন ভারসাম্য করার জন্য O₂ কে O₃ এ পরিবর্তন করে। এটি কি সঠিক? কেন এটি ভুল এবং সঠিক পদ্ধতি কী তা ব্যাখ্যা করুন।',
    explainPromptHeader: 'আকারা মেন্টর',
    audioLabel: 'শুনুন',
  },
  te: {
    masteryQuestion: 'రసాయన సమీకరణాన్ని సమతుల్యం చేసేటప్పుడు ద్రవ్య నిత్యత్వ నియమం ఎలా వర్తిస్తుందో మీ స్వంత మాటలలో వివరించండి?',
    misconceptionQuestion: 'ఆక్సిజన్‌ను బ్యాలెన్స్ చేయడానికి కొంతమంది O₂ ను O₃ గా మారుస్తారు. ఇది సరైనదేనా? ఎందుకు తప్పో మరియు సరైన పద్ధతి ఏమిటో వివరించండి.',
    explainPromptHeader: 'అకార మెంటార్',
    audioLabel: 'వినండి',
  },
  ta: {
    masteryQuestion: 'ஒரு வேதியியல் சமன்பாட்டை சமன் செய்யும் போது நிறை மாறா விதி எவ்வாறு பொருந்துகிறது என்பதை உங்கள் சொந்த வார்த்தைகளில் விளக்குங்கள்?',
    misconceptionQuestion: 'சில மாணவர்கள் ஆக்சிஜனை சமன் செய்ய O₂ ஐ O₃ என மாற்றுகிறார்கள். இது சரியா? ஏன் தவறானது என்பதை விளக்குங்கள்.',
    explainPromptHeader: 'அகரா வழிகாட்டி',
    audioLabel: 'கேளுங்கள்',
  },
  gu: {
    masteryQuestion: 'રાસાયણિક સમીકરણ સંતુલિત કરતી વખતે દ્રવ્ય સંરક્ષણનો નિયમ કેવી રીતે લાગુ પડે છે તે તમારા પોતાના શબ્દોમાં સમજાવો?',
    misconceptionQuestion: 'કેટલાક વિદ્યાર્થીઓ ઓક્સિજન સંતુલિત કરવા O₂ ને O₃ માં બદલે છે. શું આ યોગ્ય છે? સમજાવો શા માટે આ પદ્ધતિ ખોટી છે.',
    explainPromptHeader: 'અકારા મેન્ટર',
    audioLabel: 'સાંભળો',
  },
  kn: {
    masteryQuestion: 'ರಾಸಾಯನಿಕ ಸಮೀಕರಣವನ್ನು ಸಮತೋಲನಗೊಳಿಸುವಾಗ ರಾಶಿ ಸಂರಕ್ಷಣೆಯ ನಿಯಮವು ಹೇಗೆ ಅನ್ವಯಿಸುತ್ತದೆ ಎಂಬುದನ್ನು ನಿಮ್ಮ ಸ್ವಂತ ಮಾತುಗಳಲ್ಲಿ ವಿವರಿಸಿ?',
    misconceptionQuestion: 'ಕೆಲವು ವಿದ್ಯಾರ್ಥಿಗಳು ಆಮ್ಲಜನಕವನ್ನು ಸಮತೋಲನಗೊಳಿಸಲು O₂ ಅನ್ನು O₃ ಎಂದು ಬದಲಾಯಿಸುತ್ತಾರೆ. ಇದು ಸರಿಯೇ? ಇದು ಏಕೆ ತಪ್ಪು ಎಂಬುದನ್ನು ವಿವರಿಸಿ.',
    explainPromptHeader: 'ಅಕಾರ ಮಾರ್ಗದರ್ಶಿ',
    audioLabel: 'ಆಲಿಸಿ',
  },
  ml: {
    masteryQuestion: 'ഒരു രാസസമവാക്യം തുലനം ചെയ്യുമ്പോൾ ദ്രവ്യസംരക്ഷണ നിയമം എങ്ങനെ പ്രയോഗിക്കപ്പെടുന്നു എന്ന് നിങ്ങളുടെ സ്വന്തം വാക്കുകളിൽ വിശദീകരിക്കുക?',
    misconceptionQuestion: 'ഓക്സിജൻ തുലനം ചെയ്യാൻ ചിലർ O₂ നെ O₃ ആക്കി മാറ്റുന്നു. ഇത് ശരിയാണോ? എന്തുകൊണ്ടാണ് ഇത് തെറ്റ് എന്ന് വിശദീകരിക്കുക.',
    explainPromptHeader: 'അകാര മെന്റർ',
    audioLabel: 'കേൾക്കുക',
  },
  pa: {
    masteryQuestion: 'ਆਪਣੇ ਸ਼ਬਦਾਂ ਵਿੱਚ ਦੱਸੋ ਕਿ ਰਸਾਇਣਕ ਸਮੀਕਰਨ ਨੂੰ ਸੰਤੁਲਿਤ ਕਰਦੇ ਸਮੇਂ ਪੁੰਜ ਦੀ ਸੰਭਾਲ ਦਾ ਨਿਯਮ ਕਿਵੇਂ ਲਾਗੂ ਹੁੰਦਾ ਹੈ?',
    misconceptionQuestion: 'ਕੁਝ ਵਿਦਿਆਰਥੀ ਆਕਸੀਜਨ ਨੂੰ ਸੰਤੁਲਿਤ ਕਰਨ ਲਈ O₂ ਨੂੰ O₃ ਵਿੱਚ ਬਦਲ ਦਿੰਦੇ ਹਨ। ਕੀ ਇਹ ਸਹੀ ਹੈ? ਸਮਝਾਓ ਕਿ ਇਹ ਗਲਤ ਕਿਉਂ ਹੈ।',
    explainPromptHeader: 'ਅਕਾਰਾ ਮੈਂਟਰ',
    audioLabel: 'ਸੁਣੋ',
  },
  ur: {
    masteryQuestion: 'اپنے الفاظ میں بتائیں کہ کیمیائی مساوات کو متوازن کرتے وقت بقائے مادہ کا قانون کیسے لاگو ہوتا ہے؟',
    misconceptionQuestion: 'کچھ طلباء آکسیجن کو متوازن کرنے کے لیے O₂ کو O₃ میں بدل دیتے ہیں۔ کیا یہ درست ہے؟ وضاحت کریں کہ یہ کیوں غلط ہے۔',
    explainPromptHeader: 'اکارا مینٹور',
    audioLabel: 'سنیں',
  },
  or: {
    masteryQuestion: 'ନିଜ ଭାଷାରେ ବୁଝାନ୍ତୁ ଯେ ରାସାୟନିକ ସମୀକରଣ ସନ୍ତୁଳନ ବେଳେ ବସ୍ତୁତ୍ଵ ସଂରକ୍ଷଣ ନିୟମ କିପରି ଲାଗୁ ହୁଏ?',
    misconceptionQuestion: 'ଅକ୍ସିଜେନ ସନ୍ତୁଳନ ପାଇଁ କିଛି ପିଲା O₂ କୁ O₃ ଲେଖନ୍ତି। ଏହା କଣ ଠିକ? ଏହି ଭୁଲ କାହିଁକି ତାହା ବୁଝାନ୍ତୁ।',
    explainPromptHeader: 'ଅକାରା ମେଣ୍ଟର',
    audioLabel: 'ଶୁଣନ୍ତୁ',
  },
};

export const conceptMediaService = {
  /**
   * Retrieves or determines the backend generation status for a specific concept + language.
   * Distinguishes INSTANT, FINISHING_DUB, and GENERATING_FIRST_TIME based on real backend state.
   */
  async getGenerationStatus(conceptId: string, language: string): Promise<GenerationStatusResponse> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/concepts/:conceptId/generation-status?lang={language}.
    // The current status is derived from the local mock cache and should come from the backend rendering pipeline state.
    const key = `${conceptId}:${language}`;
    const cache = getStoredStatuses();

    // If previously marked instant, return instant
    if (cache[key] === 'instant') {
      return {
        status: 'instant',
        progressPercent: 100,
        availableLanguages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'],
        conceptId,
        language,
      };
    }

    // Check if recorded as finishing dub
    if (cache[key] === 'finishing_dub') {
      return {
        status: 'finishing_dub',
        progressPercent: 88,
        currentStage: 'Synthesizing localized neural audio track…',
        estimatedSecondsRemaining: 3,
        availableLanguages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'],
        conceptId,
        language,
      };
    }

    // Foundational languages for common concepts are instant
    if (['hi', 'en'].includes(language)) {
      cache[key] = 'instant';
      saveStoredStatuses(cache);
      return {
        status: 'instant',
        progressPercent: 100,
        availableLanguages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'],
        conceptId,
        language,
      };
    }

    // Other regional languages that have base video in library data
    const allConcepts = await libraryRepositoryService.getConcepts();
    const found = allConcepts.find((c) => c.id === conceptId);
    if (found && found.availableLanguages.includes(language)) {
      // Concept exists in repository; audio dubbing needed for newly selected regional stream
      return {
        status: 'finishing_dub',
        progressPercent: 92,
        currentStage: 'Aligning regional voiceover with visual scene markers…',
        estimatedSecondsRemaining: 2,
        availableLanguages: found.availableLanguages,
        conceptId,
        language,
      };
    }

    // True cache miss: full generation pipeline
    return {
      status: 'generating_first_time',
      progressPercent: 35,
      currentStage: 'Analyzing NCERT syllabus & generating verified visual script…',
      estimatedSecondsRemaining: 9,
      availableLanguages: found ? found.availableLanguages : ['hi', 'en'],
      conceptId,
      language,
    };
  },

  /**
   * Promotes a concept + language state to INSTANT once dubbing or generation completes
   */
  markGenerationReady(conceptId: string, language: string): void {
    const key = `${conceptId}:${language}`;
    const cache = getStoredStatuses();
    cache[key] = 'instant';
    saveStoredStatuses(cache);
  },

  /**
   * Force set a status (useful for QA testing all 3 video loading states on any concept)
   */
  setTestStatus(conceptId: string, language: string, status: BackendGenerationStatus): void {
    const key = `${conceptId}:${language}`;
    const cache = getStoredStatuses();
    cache[key] = status;
    saveStoredStatuses(cache);
  },

  /**
   * Retrieves the unified Generated Concept Data.
   * All 4 practice modes (Listen, Concept Card, Mind Map, Quick Quiz) and the Learn/Explain flows
   * read from this exact shared model.
   */
  async getGeneratedConceptData(conceptId: string, requestedLanguage?: string): Promise<GeneratedConceptData> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by GET /api/concepts/:conceptId/media.
    // The current response is assembled from the hardcoded repository catalog plus local mock scene/video data.
    const user = authService.getCurrentUser();
    const language = requestedLanguage || user?.default_language || 'hi';

    // Retrieve concept metadata from library
    const allConcepts = await libraryRepositoryService.getConcepts();
    const concept = allConcepts.find((c) => c.id === conceptId) || {
      id: conceptId,
      name: 'Balancing Chemical Equations',
      shortDescription: 'Systematic stoichiometric balancing of reactants and products ensuring atom conservation.',
      subjectId: 'science',
      subjectName: 'Science',
      domain: 'Chemistry',
      chapterId: 'chemical-reactions',
      chapterName: 'Chemical Reactions and Equations',
      topicName: 'Chemical Equations & Balancing',
      class: 10,
      order: 2,
      availableLanguages: ['hi', 'en', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'],
      languageCount: 12,
      totalGeneratedVideos: 12,
      videoDurationMinutes: 14,
      studentProgress: 'available' as const,
    };

    // Check if an active diagnostic misconception exists for this concept
    const activeDiagnostic = diagnosticService.getDiagnosticForConcept(conceptId);
    const hasDiagnostic = !!activeDiagnostic;

    // Localized mentor prompt strings
    const localizedStrings = LOCALIZED_MENTOR_PROMPTS[language] || LOCALIZED_MENTOR_PROMPTS.en;

    // NCERT citation trust signal
    const ncertCitation = `NCERT — Class ${concept.class} ${concept.subjectName} · Chapter ${concept.chapterName} · Section ${concept.topicName}`;

    // 1. Unified Video / Scenes
    const videoScenes: VideoScene[] = [
      {
        time: 0,
        title: 'Conservation of Mass Law',
        caption: 'Mass can neither be created nor destroyed in a chemical transformation.',
        graphicType: 'diagram',
        formulaOrFormulaSnippet: 'Total Mass of Reactants = Total Mass of Products',
      },
      {
        time: 45,
        title: 'Counting Atoms Per Element',
        caption: 'List the number of atoms of each element present in unbalanced reactants vs products.',
        graphicType: 'equation',
        formulaOrFormulaSnippet: 'Fe + H₂O → Fe₃O₄ + H₂',
      },
      {
        time: 90,
        title: 'Adjusting Stoichiometric Multipliers',
        caption: 'Place whole number coefficients in front of formulas; never alter subscripts!',
        graphicType: 'reaction',
        formulaOrFormulaSnippet: '3Fe + 4H₂O → Fe₃O₄ + 4H₂',
      },
      {
        time: 140,
        title: 'Verifying Atom Equality',
        caption: 'Confirm both sides have identical atom tallies (Fe: 3=3, H: 8=8, O: 4=4).',
        graphicType: 'graph',
        formulaOrFormulaSnippet: 'Balanced stoichiometric state reached.',
      },
    ];

    // 2. Unified Script Data (Used directly for Concept Card)
    const script: ConceptScript = {
      fullTranscript: `In this module, we examine the fundamental principle of chemical balance. According to Antoine Lavoisier's Law of Conservation of Mass, the total mass of the elements present in the products of a chemical reaction has to be equal to the total mass of the elements present in the reactants. 

To balance any skeletal chemical equation, we follow a strict systematic method:
First, draw boxes around each chemical formula. Do not change anything inside the boxes!
Second, list the number of atoms of different elements present in the unbalanced equation.
Third, start balancing with the compound that contains the maximum number of atoms. Select the element which has the maximum number of atoms in that compound.
Crucially, remember that subscripts inside a molecular formula (such as the 2 in H₂O or the 4 in Fe₃O₄) define the intrinsic molecular identity. You may only adjust the stoichiometric coefficients placed directly in front of the formula. Finally, verify the balance across each individual atom.`,
      summaryBullets: [
        'Law of Conservation of Mass: Mass is neither created nor destroyed during chemical change.',
        'Subscripts are inviolable: Changing a subscript changes the identity of the substance (e.g. changing O₂ to O₃ makes ozone, not oxygen).',
        'Stoichiometric coefficients: Only adjust the front whole-number multipliers to balance atom counts.',
        'Balanced Result: Verify identical counts of each element on both reactant and product sides.',
      ],
      keyDefinitions: [
        {
          term: 'Skeletal Chemical Equation',
          definition: 'An unbalanced chemical equation where the masses of reactants and products are unequal on both sides.',
        },
        {
          term: 'Stoichiometric Coefficient',
          definition: 'A number placed in front of a chemical formula indicating how many molecules or atoms take part in the reaction.',
        },
        {
          term: 'Law of Conservation of Mass',
          definition: 'A fundamental law stating that the total number of atoms of each element remains constant before and after a chemical reaction.',
        },
      ],
      ncertSummary: `${concept.chapterName} · Section ${concept.topicName}. Emphasizes that chemical balancing is governed by Lavoisier's conservation law and rules against subscript manipulation.`,
    };

    // 3. Unified Scene Graph Data (Used directly for Mind Map)
    const sceneGraph: SceneGraphData = {
      nodes: [
        {
          id: 'n-prereq',
          label: 'Law of Conservation of Mass',
          type: 'prerequisite',
          description: 'Total mass and atom count remain invariant across reactions.',
        },
        {
          id: 'n-core',
          label: concept.name,
          type: 'core',
          description: 'Stoichiometric balancing without altering molecular chemical subscripts.',
        },
        {
          id: 'n-app-1',
          label: 'Types of Chemical Reactions',
          type: 'application',
          description: 'Combination, decomposition, displacement, and double displacement reactions.',
        },
        {
          id: 'n-app-2',
          label: 'Redox & Electron Transfer',
          type: 'application',
          description: 'Oxidation, reduction, and everyday corrosion and rancidity effects.',
        },
        {
          id: 'n-ext',
          label: 'Stoichiometric Mole Ratios',
          type: 'extension',
          description: 'Calculating theoretical yield and mass-to-mass conversions.',
        },
      ],
      edges: [
        { from: 'n-prereq', to: 'n-core', label: 'governs' },
        { from: 'n-core', to: 'n-app-1', label: 'classifies' },
        { from: 'n-core', to: 'n-app-2', label: 'quantifies' },
        { from: 'n-app-1', to: 'n-ext', label: 'extends into' },
      ],
    };

    // 4. Unified Quiz Questions (Derived from the script)
    const quiz: QuizQuestion[] = [
      {
        id: 'q-01',
        question: 'Which fundamental scientific law mandates that chemical equations must be balanced?',
        options: [
          'Law of Definite Proportions',
          'Law of Conservation of Mass',
          "Avogadro's Law",
          "Boyle's Law",
        ],
        correctIndex: 1,
        explanation:
          'According to the Law of Conservation of Mass, the total mass and atom counts of each element remain unchanged throughout a reaction.',
      },
      {
        id: 'q-02',
        question: 'When balancing an equation, which part of a chemical formula is strictly forbidden to alter?',
        options: [
          'The front stoichiometric coefficient',
          'The physical state symbol (e.g. (s), (l), (g))',
          'The subscript inside the formula (e.g. the 2 in H₂O)',
          'The order in which reactants are written',
        ],
        correctIndex: 2,
        explanation:
          'Subscripts define the chemical identity of the compound. Changing subscripts alters the actual substance rather than balancing the equation.',
      },
      {
        id: 'q-03',
        question: 'What is the balanced stoichiometric coefficient of O₂ in: 2Mg + O₂ → 2MgO?',
        options: ['1', '2', '3', '4'],
        correctIndex: 0,
        explanation:
          'Reactant side has 1 molecule of O₂ (giving 2 oxygen atoms), which balances the 2 oxygen atoms in 2MgO.',
      },
      {
        id: 'q-04',
        question: 'What is the first recommended step in the systematic balancing method?',
        options: [
          'Draw boxes around formulas and leave interior formulas untouched',
          'Multiply all numbers by 2 immediately',
          'Remove state symbols to simplify calculation',
          'Balance hydrogen atoms first before any other element',
        ],
        correctIndex: 0,
        explanation:
          'Drawing boxes around formulas ensures you never accidentally alter subscripts inside molecular formulas.',
      },
      {
        id: 'q-05',
        question: 'In the balanced reaction: 3Fe + 4H₂O → Fe₃O₄ + xH₂, what is the coefficient x?',
        options: ['2', '3', '4', '8'],
        correctIndex: 2,
        explanation:
          '4 molecules of H₂O supply 8 hydrogen atoms. To balance 8 hydrogen atoms on the product side, x must be 4.',
      },
      {
        id: 'q-06',
        question: 'What does the state symbol (aq) written after a chemical formula represent?',
        options: [
          'The substance is dissolved in water as a solution',
          'The substance is a pure liquid',
          'The reaction occurs at atmospheric pressure',
          'The substance is an insoluble precipitate',
        ],
        correctIndex: 0,
        explanation:
          'The designation (aq) denotes aqueous, meaning the reactant or product is present as a solution in water.',
      },
      {
        id: 'q-07',
        question: 'Which reaction type is represented by: CaO(s) + H₂O(l) → Ca(OH)₂(aq) + Heat?',
        options: [
          'Decomposition reaction',
          'Combination reaction',
          'Displacement reaction',
          'Double displacement reaction',
        ],
        correctIndex: 1,
        explanation:
          'Quicklime and water combine to form a single product, slaked lime, which characterizes a combination reaction.',
      },
      {
        id: 'q-08',
        question: 'During thermal decomposition of lead nitrate [2Pb(NO₃)₂], what brown fumes are released?',
        options: [
          'Nitrogen gas (N₂)',
          'Nitrogen dioxide (NO₂)',
          'Nitrous oxide (N₂O)',
          'Oxygen gas (O₂)',
        ],
        correctIndex: 1,
        explanation:
          'Heating lead nitrate decomposes it into lead monoxide, oxygen gas, and brown nitrogen dioxide (NO₂) fumes.',
      },
      {
        id: 'q-09',
        question: 'When an iron nail is placed in blue copper sulphate solution, why does it turn light green?',
        options: [
          'Iron displaces copper, forming iron(II) sulphate (FeSO₄)',
          'Copper dissolves into a gas',
          'Iron rusts with water vapour only',
          'Copper sulphate precipitates as a white salt',
        ],
        correctIndex: 0,
        explanation:
          'Because iron is more reactive than copper, it displaces copper from copper sulphate solution to form green FeSO₄.',
      },
      {
        id: 'q-10',
        question: 'In the reaction CuO + H₂ → Cu + H₂O, which substance undergoes reduction?',
        options: [
          'Copper oxide (CuO)',
          'Hydrogen gas (H₂)',
          'Water (H₂O)',
          'Pure Copper (Cu)',
        ],
        correctIndex: 0,
        explanation:
          'Copper oxide (CuO) loses oxygen to become elemental copper (Cu); loss of oxygen is reduction.',
      },
    ];

    // 5. Unified Mentor Prompt Data for Explain
    const mentorPrompt: MentorPromptData = {
      scenario: hasDiagnostic ? 'misconception_check' : 'mastery_confirmation',
      scenarioLabel: hasDiagnostic ? 'Targeted Misconception Check' : 'Mastery Confirmation',
      questionText: hasDiagnostic
        ? localizedStrings.misconceptionQuestion
        : localizedStrings.masteryQuestion,
      mentorPromptAudioDurationSeconds: 14,
      deliberateMisconception: hasDiagnostic ? activeDiagnostic.diagnosticInsight : undefined,
      keyPrinciplesToCover: [
        'Law of conservation of mass (atoms neither created nor destroyed)',
        'Subscripts cannot be changed because that changes compound identity',
        'Only front stoichiometric coefficients can be adjusted',
      ],
      sampleIdealResponse:
        'Subscripts define molecular composition. Changing O₂ to O₃ creates ozone instead of oxygen. To balance oxygen, you multiply the entire formula with a front coefficient like 2H₂O so the formula remains intact while the atom count balances.',
    };

    return {
      conceptId: concept.id,
      conceptName: concept.name,
      subjectId: concept.subjectId,
      subjectName: concept.subjectName,
      chapterId: concept.chapterId,
      chapterName: concept.chapterName,
      topicName: concept.topicName,
      classNumber: concept.class,
      ncertCitation,
      language,
      availableLanguages: concept.availableLanguages || ['hi', 'en'],
      video: {
        title: `${concept.name} — Full Explainer`,
        durationSeconds: (concept.videoDurationMinutes || 12) * 60,
        durationFormatted: `${concept.videoDurationMinutes || 12}:00`,
        scenes: videoScenes,
      },
      script,
      sceneGraph,
      quiz,
      mentorPrompt,
    };
  },

  /**
   * Evaluates a student's explanation (spoken or typed).
   * Runs the unified pedagogical evaluation against the concept principles.
   */
  async evaluateExplanation(
    conceptId: string,
    studentAnswerText: string,
    scenario: 'mastery_confirmation' | 'misconception_check',
    language: string
  ): Promise<ExplanationEvaluationResult> {
    // FRONTEND BACKEND HOOK:
    // This is the exact frontend call site that will be replaced by POST /api/concepts/:conceptId/evaluate-explanation.
    // The current function performs a local heuristic scoring pass; backend should evaluate the spoken/text answer
    // against the concept rubric and return mastery outcome plus diagnostic resolution state.
    // Light latency to reflect genuine pedagogical assessment
    await new Promise((resolve) => setTimeout(resolve, 600));

    const clean = studentAnswerText.toLowerCase().trim();
    const length = clean.length;

    // Check for key conceptual tokens
    const mentionsConservation = clean.includes('conservation') || clean.includes('mass') || clean.includes('द्रव्यमान') || clean.includes('संवर्धन') || clean.includes('ভর') || clean.includes('నిత్యత్వ');
    const mentionsSubscriptOrFormula = clean.includes('subscript') || clean.includes('formula') || clean.includes('coefficient') || clean.includes('सूत्र') || clean.includes('गुणांक') || clean.includes('বদল');
    const mentionsIdentityOrRule = clean.includes('change') || clean.includes('atom') || clean.includes('परमाणु') || clean.includes('गलत') || clean.includes('wrong') || clean.includes('ozone');

    let scorePercent = 40;
    const pointsCovered: string[] = [];
    const pointsMissed: string[] = [];

    if (mentionsConservation) {
      scorePercent += 25;
      pointsCovered.push('Referenced the Law of Conservation of Mass.');
    } else {
      pointsMissed.push('Did not explicitly link balancing to the Law of Conservation of Mass.');
    }

    if (mentionsSubscriptOrFormula) {
      scorePercent += 25;
      pointsCovered.push('Distinguished between internal subscripts and front coefficients.');
    } else {
      pointsMissed.push('Could emphasize why internal chemical subscripts must never be altered.');
    }

    if (mentionsIdentityOrRule || length > 40) {
      scorePercent += 20;
      pointsCovered.push('Correctly articulated that changing formula subscripts alters the chemical substance itself.');
    }

    scorePercent = Math.min(100, Math.max(30, scorePercent));
    const isMastered = scorePercent >= 70;

    let diagnosticResolved = false;
    if (isMastered && scenario === 'misconception_check') {
      // Resolve any active misconception diagnostic for this concept
      const activeDiag = diagnosticService.getDiagnosticForConcept(conceptId);
      if (activeDiag) {
        await diagnosticService.resolveDiagnostic(activeDiag.id);
        diagnosticResolved = true;
      }
    }

    // Feedback headlines & text
    let feedbackHeadline = isMastered
      ? 'Feynman Mastery Cleared!'
      : 'Good Attempt — A Small Conceptual Nuance to Clarify';

    let mentorFeedbackText = isMastered
      ? `Outstanding explanation! You clearly demonstrated why stoichiometric coefficients are used instead of altering chemical formulas. Your reasoning satisfies NCERT requirements.`
      : `You're on the right track! Remember: modifying the subscript (like turning O₂ into O₃) changes the actual substance. We only place multipliers in front of the formula so the identity remains intact while atom counts balance.`;

    return {
      isMastered,
      scorePercent,
      feedbackHeadline,
      mentorFeedbackText,
      pointsCovered,
      pointsMissed,
      diagnosticResolved,
    };
  },
};
