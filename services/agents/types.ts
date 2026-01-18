/**
 * Agent Types and Interfaces
 * Multi-agent architecture for Stanse
 */

import { PoliticalCoordinates, NewsEvent, BrandAlignment } from '../../types';

// Base agent response
export interface AgentResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    source: string;
    timestamp: Date;
    processingTime?: number;
  };
}

// News Agent types
export interface RawNewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: Date;
  language: 'en' | 'zh' | 'ja' | 'fr' | 'es';
  category?: string;
  imageUrl?: string;
  sourceType?: 'rss' | 'grounding' | '6park' | 'breaking';  // Track where news came from
}

export interface ProcessedNewsItem extends NewsEvent {
  titleHash: string;
  embedding?: number[];
  originalLanguage: string;
  sources: string[];
  sourceType?: 'rss' | 'grounding' | '6park' | 'breaking';  // Track where news came from
  relevanceScore?: number;
}

// Publishing Agent types
export interface NewsEmbedding {
  titleHash: string;
  embedding: number[];
  title: string;
  category: string;
  createdAt: Date;
}

export interface PersonalizedFeed {
  news: ProcessedNewsItem[];
  userStance: PoliticalCoordinates;
  diversityScore: number;
}

// Stance Agent types
export interface StanceCalculationRequest {
  answers: any; // OnboardingAnswers
  language: string;
}

export interface StanceCalculationResponse {
  coordinates: PoliticalCoordinates;
  confidence: number;
}

// Sense Agent types
export interface EntityReport {
  entityName: string;
  entityType: 'company' | 'person' | 'country' | 'organization' | 'party';
  alignment: BrandAlignment;
  recentNews?: ProcessedNewsItem[];
  socialSignals?: string[];
  lastUpdated: Date;
}

// Agent configuration
export interface AgentConfig {
  name: string;
  enabled: boolean;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

// News sources configuration
export interface NewsSourceConfig {
  name: string;
  type: 'api' | 'rss' | 'scraper' | 'grounding';
  enabled: boolean;
  languages: string[];
  categories: string[];
  priority: number;
}

export const NEWS_SOURCES: NewsSourceConfig[] = [
  {
    name: 'google-search-grounding',
    type: 'grounding',
    enabled: true,
    languages: ['en'],
    categories: ['politics', 'tech', 'military', 'world', 'business'],
    priority: 1
  },
  {
    name: 'google-news-rss',
    type: 'rss',
    enabled: true,
    languages: ['en'],
    categories: ['politics', 'tech', 'military', 'world', 'business'],
    priority: 2
  },
  {
    name: '6park-news',
    type: 'scraper',
    enabled: true,
    languages: ['zh'],
    categories: ['politics', 'world', 'business'],
    priority: 3
  }
];
