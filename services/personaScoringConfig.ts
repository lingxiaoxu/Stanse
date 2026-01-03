/**
 * Persona-Aware Scoring Configuration
 *
 * Defines scoring strategies for 8 different political personas.
 * Each persona has unique preferences for FEC donations, ESG priorities, etc.
 */

import { StanceType } from './companyRankingService';

export interface PersonaFECConfig {
  // Party preference: -1 = prefer GOP, 0 = neutral, 1 = prefer DEM
  partyPreference: number;

  // How much total donation amount matters (0-1)
  // High value = penalize companies that donate heavily (anti-establishment)
  // Low value = ignore donation amounts
  amountSensitivity: number;
}

export interface PersonaESGConfig {
  // Weights for E/S/G components (should sum to 1.0)
  environmentalWeight: number;  // 0-1
  socialWeight: number;          // 0-1
  governanceWeight: number;      // 0-1

  // Whether high ESG is good (true) or bad (false)
  preferHighESG: boolean;

  // ESG preference strength (0-1)
  // 1.0 = strongly prefer high/low ESG based on preferHighESG
  // 0.5 = moderate preference
  // 0.0 = neutral
  esgImportance: number;
}

export interface PersonaExecutiveConfig {
  // Expected political leanings (for matching)
  preferredLeanings: string[];  // e.g., ['progressive', 'liberal', 'moderate']

  // Minimum confidence to trust executive analysis (0-100)
  confidenceThreshold: number;
}

export interface PersonaNewsConfig {
  // Sentiment preference: -1 = prefer negative, 0 = neutral, 1 = prefer positive
  sentimentPreference: number;

  // How much news matters vs other factors
  newsImportance: number;  // 0-1
}

export interface PersonaScoringConfig {
  fec: PersonaFECConfig;
  esg: PersonaESGConfig;
  executive: PersonaExecutiveConfig;
  news: PersonaNewsConfig;
}

/**
 * Scoring configurations for all 8 persona types
 */
export const PERSONA_CONFIGS: Record<StanceType, PersonaScoringConfig> = {
  'progressive-globalist': {
    fec: {
      partyPreference: 0.9,        // Strongly prefer Democratic donations
      amountSensitivity: 0.5,      // Moderate concern about big money in politics
    },
    esg: {
      environmentalWeight: 0.4,    // High environmental focus
      socialWeight: 0.4,           // High social justice focus
      governanceWeight: 0.2,       // Moderate governance focus
      preferHighESG: true,         // Strongly prefer high ESG
      esgImportance: 0.9,          // ESG very important
    },
    executive: {
      preferredLeanings: ['progressive', 'liberal', 'moderate'],
      confidenceThreshold: 60,
    },
    news: {
      sentimentPreference: 0.3,    // Slightly prefer positive news
      newsImportance: 0.6,
    },
  },

  'progressive-nationalist': {
    fec: {
      partyPreference: 0.8,        // Prefer Democratic donations
      amountSensitivity: 0.7,      // Higher concern about corporate influence
    },
    esg: {
      environmentalWeight: 0.35,   // Environmental focus
      socialWeight: 0.35,          // Social focus (especially workers' rights)
      governanceWeight: 0.3,       // Governance (domestic accountability)
      preferHighESG: true,
      esgImportance: 0.8,
    },
    executive: {
      preferredLeanings: ['progressive', 'liberal', 'moderate'],
      confidenceThreshold: 65,
    },
    news: {
      sentimentPreference: 0.2,
      newsImportance: 0.5,
    },
  },

  'socialist-libertarian': {
    fec: {
      partyPreference: 0.7,        // Left-leaning but skeptical of both parties
      amountSensitivity: 0.8,      // High concern about money in politics
    },
    esg: {
      environmentalWeight: 0.3,
      socialWeight: 0.4,           // Workers' rights focus
      governanceWeight: 0.3,
      preferHighESG: true,
      esgImportance: 0.7,
    },
    executive: {
      preferredLeanings: ['progressive', 'liberal', 'moderate', 'libertarian'],
      confidenceThreshold: 60,
    },
    news: {
      sentimentPreference: 0.0,    // Neutral
      newsImportance: 0.4,
    },
  },

  'socialist-nationalist': {
    fec: {
      partyPreference: 0.6,        // Moderate left preference
      amountSensitivity: 0.9,      // Very high concern about corporate money
    },
    esg: {
      environmentalWeight: 0.3,
      socialWeight: 0.4,           // Workers' rights, domestic labor
      governanceWeight: 0.3,
      preferHighESG: true,
      esgImportance: 0.6,
    },
    executive: {
      preferredLeanings: ['progressive', 'moderate', 'conservative'],
      confidenceThreshold: 65,
    },
    news: {
      sentimentPreference: -0.2,   // Slightly prefer critical news
      newsImportance: 0.5,
    },
  },

  'capitalist-globalist': {
    fec: {
      partyPreference: 0.3,        // Slight Democratic lean (socially progressive)
      amountSensitivity: 0.2,      // Low concern about donations
    },
    esg: {
      environmentalWeight: 0.3,
      socialWeight: 0.4,           // Social progressivism (diversity, inclusion)
      governanceWeight: 0.3,
      preferHighESG: true,
      esgImportance: 0.7,
    },
    executive: {
      preferredLeanings: ['liberal', 'moderate', 'conservative'],
      confidenceThreshold: 55,
    },
    news: {
      sentimentPreference: 0.4,    // Prefer positive news (innovation)
      newsImportance: 0.6,
    },
  },

  'capitalist-nationalist': {
    fec: {
      partyPreference: 0.2,        // Slight Democratic lean (social issues)
      amountSensitivity: 0.3,      // Low-moderate concern
    },
    esg: {
      environmentalWeight: 0.25,
      socialWeight: 0.35,          // Domestic social issues
      governanceWeight: 0.4,       // Corporate accountability
      preferHighESG: true,
      esgImportance: 0.5,
    },
    executive: {
      preferredLeanings: ['moderate', 'conservative', 'libertarian'],
      confidenceThreshold: 60,
    },
    news: {
      sentimentPreference: 0.3,
      newsImportance: 0.5,
    },
  },

  'conservative-globalist': {
    fec: {
      partyPreference: -0.8,       // Strongly prefer Republican donations
      amountSensitivity: 0.2,      // Low concern about donations
    },
    esg: {
      environmentalWeight: 0.2,
      socialWeight: 0.2,
      governanceWeight: 0.6,       // Focus on corporate governance
      preferHighESG: false,        // Skeptical of ESG regulations
      esgImportance: 0.4,
    },
    executive: {
      preferredLeanings: ['conservative', 'moderate', 'libertarian'],
      confidenceThreshold: 60,
    },
    news: {
      sentimentPreference: 0.2,
      newsImportance: 0.5,
    },
  },

  'conservative-nationalist': {
    fec: {
      partyPreference: -0.9,       // Strongly prefer Republican donations
      amountSensitivity: 0.4,      // Moderate concern (anti-establishment)
    },
    esg: {
      environmentalWeight: 0.15,
      socialWeight: 0.25,
      governanceWeight: 0.6,
      preferHighESG: false,        // Against ESG mandates
      esgImportance: 0.3,
    },
    executive: {
      preferredLeanings: ['conservative', 'moderate'],
      confidenceThreshold: 65,
    },
    news: {
      sentimentPreference: 0.0,
      newsImportance: 0.4,
    },
  },
};
