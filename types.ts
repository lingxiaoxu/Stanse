
export enum ViewState {
  LOGIN = 'LOGIN',
  FEED = 'FEED',
  SENSE = 'SENSE', // Renamed from SCANNER
  FINGERPRINT = 'FINGERPRINT',
  UNION = 'UNION',
  MANIFESTO = 'MANIFESTO',
  PRIVACY = 'PRIVACY',
  SETTINGS = 'SETTINGS'
}

export enum Language {
  EN = 'EN',
  ZH = 'ZH',
  JA = 'JA',
  FR = 'FR',
  ES = 'ES'
}

export interface PoliticalCoordinates {
  economic: number; // -100 (Socialism) to 100 (Free Market)
  social: number; // -100 (Authoritarian) to 100 (Libertarian)
  diplomatic: number; // -100 (Nationalist) to 100 (Internationalist)
  label: string; // AI Generated Persona
}

export interface BrandAlignment {
  brandName: string;
  score: number; // 0-100
  status: 'MATCH' | 'CONFLICT' | 'NEUTRAL';
  reportSummary: string; // concise summary
  socialSignal: string; // Twitter/X analysis summary
  keyConflicts: string[]; // bullet points
  keyAlignments: string[]; // bullet points
  reasoning: string; // deprecated but kept for compatibility if needed
  alternatives?: string[];
  sources: string[];
}

export interface NewsEvent {
  id: string;
  title: string;
  summary: string;
  date: string;
  imageUrl: string;
  sourceUrl?: string;
  category?: string;
  prism?: {
    support: string;
    oppose: string;
    neutral: string;
  };
}

export interface Campaign {
  id: string;
  title: string;
  target: string; // The brand or entity
  type: 'BOYCOTT' | 'BUYCOTT' | 'PETITION';
  participants: number;
  goal: number;
  description: string;
  daysActive: number;
}

export interface StockTicker {
  symbol: string;
  name: string;
  price: number;
  change: number; // percentage
  alignment: 'HIGH' | 'LOW'; // Alignment with user values
}

// Onboarding questionnaire types
export interface UserDemographics {
  birthCountry: string;
  currentCountry: string;
  currentState: string; // State or Province
  age: number;
}

export interface WarStance {
  warId: string;
  warName: string;
  stance: 'SIDE_A' | 'SIDE_B' | 'NEUTRAL'; // e.g., Ukraine/Russia/Neutral
  sideAName: string;
  sideBName: string;
}

export interface PoliticalPreferences {
  mostHatedInitiative: string;
  mostSupportedInitiative: string;
  warStances: WarStance[];
  questionAnswers: QuestionAnswer[];
}

export interface OnboardingAnswers {
  demographics: UserDemographics;
  politicalPreferences: PoliticalPreferences;
  completedAt?: string; // ISO date string
}

// Current active wars for questionnaire
export const CURRENT_WARS: Omit<WarStance, 'stance'>[] = [
  {
    warId: 'ukraine-russia',
    warName: 'Russia-Ukraine War',
    sideAName: 'Ukraine',
    sideBName: 'Russia'
  },
  {
    warId: 'israel-palestine',
    warName: 'Israel-Palestine Conflict',
    sideAName: 'Israel',
    sideBName: 'Palestine'
  },
  {
    warId: 'sudan-civil',
    warName: 'Sudan Civil War',
    sideAName: 'Sudanese Army (SAF)',
    sideBName: 'Rapid Support Forces (RSF)'
  }
];

// Political dimension questions (5 questions covering 3 dimensions)
export interface PoliticalQuestion {
  id: string;
  question: string;
  dimension: 'economic' | 'social' | 'diplomatic';
  optionA: string; // Left/Auth/Nationalist side
  optionB: string; // Right/Lib/Globalist side
}

export interface QuestionAnswer {
  questionId: string;
  answer: 'A' | 'B' | 'NEUTRAL';
}

export const POLITICAL_QUESTIONS: PoliticalQuestion[] = [
  // Economic dimension (2 questions)
  {
    id: 'econ-1',
    question: 'How should healthcare be funded?',
    dimension: 'economic',
    optionA: 'Government-funded universal healthcare',
    optionB: 'Private insurance with market competition'
  },
  {
    id: 'econ-2',
    question: 'What is the best approach to wealth inequality?',
    dimension: 'economic',
    optionA: 'Higher taxes on the wealthy, more redistribution',
    optionB: 'Lower taxes, let the free market create opportunities'
  },
  // Social dimension (2 questions)
  {
    id: 'social-1',
    question: 'How should society approach traditional values vs progressive change?',
    dimension: 'social',
    optionA: 'Preserve traditional values and institutions',
    optionB: 'Embrace progressive social change'
  },
  {
    id: 'social-2',
    question: 'What role should government play in personal lifestyle choices?',
    dimension: 'social',
    optionA: 'Government should guide moral standards',
    optionB: 'Individuals should decide for themselves'
  },
  // Diplomatic dimension (1 question)
  {
    id: 'diplo-1',
    question: 'How should your country engage with the world?',
    dimension: 'diplomatic',
    optionA: 'Prioritize national interests, limit foreign involvement',
    optionB: 'Embrace international cooperation and global institutions'
  }
];
