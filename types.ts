
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
