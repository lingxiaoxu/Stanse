
export enum ViewState {
  LOGIN = 'LOGIN',
  FEED = 'FEED',
  SENSE = 'SENSE', // Renamed from SCANNER
  FINGERPRINT = 'FINGERPRINT',
  UNION = 'UNION',
  MANIFESTO = 'MANIFESTO',
  PRIVACY = 'PRIVACY',
  SETTINGS = 'SETTINGS',
  ACCOUNT = 'ACCOUNT'
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
  label: string; // AI Generated Persona (display label, e.g., "Indian-American Statist Nationalist")
  coreStanceType?: string; // Canonical stanceType for rankings (e.g., "socialist-nationalist")
  displayLabel?: string; // Alias for label (for clarity in future refactors)
  nationalityPrefix?: string; // Extracted nationality (e.g., "Indian-American", "Chinese-American")
}

export interface GroundingSource {
  url: string; // Full URL (may be redirect URL)
  domain: string; // Displayable domain name (e.g., "forbes.com")
}

export interface BrandAlignment {
  brandName: string;
  entityType?: string; // COMPANY, PERSON, COUNTRY, ORGANIZATION, POLITICAL_PARTY
  score: number; // 0-100
  status: 'MATCH' | 'CONFLICT' | 'NEUTRAL';
  reportSummary: string; // concise summary
  socialSignal: string; // Twitter/X analysis summary
  keyConflicts: string[]; // bullet points
  keyAlignments: string[]; // bullet points
  reasoning: string; // deprecated but kept for compatibility if needed
  alternatives?: string[];
  sources: string[] | GroundingSource[]; // Legacy: string[] | New: GroundingSource[]
  sourceMaterial?: string; // Political context and risk factors summary
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

// Non-war geopolitical conflicts (trade wars, sovereignty, decoupling)
export interface ConflictStance {
  conflictId: string;
  conflictName: string;
  stance: 'SUPPORT' | 'OPPOSE' | 'NEUTRAL';
  description?: string; // Additional context
}

export interface PoliticalPreferences {
  mostHatedInitiative: string;
  mostSupportedInitiative: string;
  warStances: WarStance[];
  conflictStances: ConflictStance[]; // New: non-war conflicts
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
    warId: 'pakistan-india',
    warName: 'Pakistan-India Conflict',
    sideAName: 'Pakistan',
    sideBName: 'India'
  }
];

// Non-war geopolitical conflicts for questionnaire
export interface ConflictQuestion {
  conflictId: string;
  conflictName: string;
  supportLabel: string;
  opposeLabel: string;
  description?: string;
}

export const CURRENT_CONFLICTS: ConflictQuestion[] = [
  {
    conflictId: 'trade-war',
    conflictName: 'Trade Tariff War: China/EU vs USA',
    supportLabel: 'Support China/EU position',
    opposeLabel: 'Support USA position',
    description: 'Ongoing trade disputes and tariffs between major economic powers'
  },
  {
    conflictId: 'taiwan-sovereignty',
    conflictName: 'China-Taiwan Cross-Strait Relations',
    supportLabel: 'Support Mainland China',
    opposeLabel: 'Oppose Mainland China',
    description: 'Cross-strait tensions and sovereignty claims'
  },
  {
    conflictId: 'west-decoupling',
    conflictName: 'Western Economic Decoupling from China & Russia',
    supportLabel: 'Support decoupling',
    opposeLabel: 'Oppose decoupling',
    description: 'Proposals to reduce economic interdependence with China and Russia'
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

// Social Media Connection types
export enum SocialPlatform {
  TWITTER = 'TWITTER',
  FACEBOOK = 'FACEBOOK',
  INSTAGRAM = 'INSTAGRAM',
  LINKEDIN = 'LINKEDIN',
  TIKTOK = 'TIKTOK'
}

export interface SocialMediaConnection {
  id?: string; // Firestore document ID
  userId: string; // Reference to the user
  platform: SocialPlatform;
  handle: string; // Username/handle (without @ prefix)
  displayName?: string; // Display name from the platform
  profileUrl?: string; // URL to the profile
  verified?: boolean; // Whether the account is verified on the platform
  followerCount?: number; // Number of followers (for future API integration)
  // API Integration fields (for future use)
  accessToken?: string; // OAuth access token (encrypted in production)
  refreshToken?: string; // OAuth refresh token (encrypted in production)
  tokenExpiresAt?: string; // ISO date string for token expiration
  apiUserId?: string; // Platform-specific user ID
  // Metadata
  connectedAt: string; // ISO date string when connection was established
  lastSyncedAt?: string; // ISO date string of last API sync
  isActive: boolean; // Whether the connection is currently active
  updatedAt: string; // ISO date string of last update
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
  },
  // Religion and governance (1 question) - Social dimension
  {
    id: 'social-3',
    question: 'Should religion play a role in politics and governance?',
    dimension: 'social',
    optionA: 'Yes, religious values should guide policies',
    optionB: 'No, keep religion separate from government'
  }
];

// ==================== Premium Subscription Types ====================

export interface UserSubscription {
  userId: string;
  status: 'active' | 'cancelled';
  hasUsedTrial: boolean;
  currentPeriodStart: string; // ISO date string
  currentPeriodEnd: string; // ISO date string
  latestAmount: number;
  trialEndsAt?: string; // ISO date string - when trial ends (cleared after first charge)
  originalTrialEndsAt?: string; // ISO date string - NEVER changes, set on first subscription
  updatedAt: string; // ISO date string
}

export interface BillingRecord {
  type: 'SUBSCRIBE_SUCCESS' | 'CANCEL' | 'RENEW' | 'PROMO_APPLIED' | 'TRIAL_END_CHARGE';
  amount: number;
  period: string; // "2026-01" format
  paymentMethodUsed?: string; // Last 4 digits, e.g., "Visa-4242"
  promoCode?: string;
  timestamp: string; // ISO date string
}

export interface PaymentMethod {
  userId: string;
  cardholderName: string;
  cardNumber: string; // Full number (simulated - in production would be tokenized)
  cardType: 'Visa' | 'Mastercard' | 'Amex';
  expiry: string; // MM/YY
  cvv: string; // Stored for simulation only - NEVER store in production
  billingZip: string;
  createdAt: string; // ISO date string
}

export interface PromotionCode {
  code: string;
  isUsed: boolean;
  userId?: string;
  userEmail?: string;
  createdAt: string; // ISO date string
  usedAt?: string; // ISO date string
}

export interface RevenueRecord {
  type: 'TRIAL_END_CHARGE' | 'MONTHLY_RENEWAL';
  period: string; // "2026-01" format
  timestamp: string; // ISO date string
  totalSubscriptions: number; // Total active subscriptions checked
  chargedCount: number; // Number of users actually charged
  skippedCount: number; // Number skipped (trial/promo)
  errorCount: number;
  totalRevenue: number; // Total revenue in this batch
  averageRevenue: number; // Average per charged user
  details?: {
    errors?: string[]; // Error messages if any
    chargedUserIds?: string[]; // List of charged user IDs (for auditing)
  };
}
