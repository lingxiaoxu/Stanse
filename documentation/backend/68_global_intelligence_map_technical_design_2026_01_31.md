# Global Intelligence Map - Technical Design Document

**Date:** 2026-01-31
**Version:** 1.0
**Status:** Design Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Feature Overview](#feature-overview)
3. [System Architecture](#system-architecture)
4. [Database Schema](#database-schema)
5. [Backend Services](#backend-services)
6. [Frontend Implementation](#frontend-implementation)
7. [AI Integration](#ai-integration)
8. [Data Flow](#data-flow)
9. [Implementation Plan](#implementation-plan)
10. [Performance Optimization](#performance-optimization)
11. [Security Considerations](#security-considerations)

---

## Executive Summary

The Global Intelligence Map is an interactive 3D globe visualization that displays geolocation-tagged intelligence data including:
- News article locations (10 most recent)
- Breaking news events
- Conflict zones
- User's birth country and current location
- Search result locations

Each marker on the globe is clickable and displays a popup with relevant information and navigation options.

---

## Feature Overview

### 5 Data Layers

1. **Recent News Locations** (10 articles)
   - Source: `news` collection
   - AI determines: Country → State/Province → City (if possible)
   - Stores coordinates in new `news_locations` collection

2. **Breaking News Locations**
   - Source: `breaking_news_notifications` collection
   - AI determines location and generates coordinates
   - Stores in new `breaking_news_locations` collection

3. **Conflict Zones**
   - Backend-provided global conflict data
   - All users see same data
   - Real-time conflict monitoring

4. **User Geographic Data**
   - Birth country (capital city)
   - Current location country (capital city)
   - From user profile

5. **Search Result Locations**
   - When user searches for entity (person/company/organization)
   - AI determines entity's primary location
   - Displays on globe with entity summary

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  SenseView.tsx                                          │ │
│  │  - Search Interface                                     │ │
│  │  - Camera Scanner                                       │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  GlobeViewer.tsx (Enhanced)                            │ │
│  │  - 3D Globe Rendering (Three.js)                       │ │
│  │  - Interactive Markers                                  │ │
│  │  - Popup System                                         │ │
│  │  - Click Handlers                                       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                   Services Layer                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Globe Service    │  │ Location Service │                │
│  │ - Fetch markers  │  │ - Geocoding      │                │
│  │ - Data aggregation│  │ - Coordinates   │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│               Cloud Functions (Backend)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Location Analysis Triggers                             │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ onNewsCreated                                     │  │ │
│  │  │ - Triggered when news document created            │  │ │
│  │  │ - Calls Gemini 2.5 Flash for location extraction │  │ │
│  │  │ - Generates coordinates                           │  │ │
│  │  │ - Stores in news_locations                        │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ onBreakingNewsCreated                             │  │ │
│  │  │ - Triggered when breaking news created            │  │ │
│  │  │ - Calls Gemini 2.5 Flash for location extraction │  │ │
│  │  │ - Generates coordinates                           │  │ │
│  │  │ - Stores in breaking_news_locations              │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  API Endpoints                                          │ │
│  │  - getGlobeMarkers(userId)                             │ │
│  │  - analyzeEntityLocation(entityName)                   │ │
│  │  - getConflictZones()                                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                 Firebase Firestore                           │
│  ┌──────────────┐  ┌────────────────────┐                  │
│  │ news         │  │ news_locations     │                  │
│  │ (existing)   │  │ (NEW)              │                  │
│  └──────────────┘  └────────────────────┘                  │
│  ┌──────────────────────────┐  ┌──────────────────────┐   │
│  │ breaking_news_           │  │ breaking_news_       │   │
│  │ notifications (existing) │  │ locations (NEW)      │   │
│  └──────────────────────────┘  └──────────────────────┘   │
│  ┌──────────────────┐  ┌────────────────────┐             │
│  │ conflict_zones   │  │ users              │             │
│  │ (NEW)            │  │ (existing)         │             │
│  └──────────────────┘  └────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                   Google Gemini 2.5 Flash                    │
│  - Location extraction from news content                     │
│  - Geocoding (Country → State → City)                       │
│  - Coordinate generation                                     │
│  - Entity location analysis                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### 1. `news_locations` Collection (NEW)

```typescript
interface NewsLocation {
  // Document ID matches news collection document ID (1:1 mapping)
  newsId: string;                    // Reference to news document

  // Location hierarchy (AI-determined)
  country: string;                   // e.g., "United States"
  countryCode: string;               // ISO 3166-1 alpha-2, e.g., "US"
  state?: string;                    // State/Province if determinable
  city?: string;                     // City if determinable

  // Geographic coordinates
  coordinates: {
    latitude: number;                // -90 to 90
    longitude: number;               // -180 to 180
  };

  // Location confidence
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  specificityLevel: 'CITY' | 'STATE' | 'COUNTRY';

  // Summary for popup
  locationSummary: string;           // AI-generated location context

  // Metadata
  analyzedAt: FirebaseFirestore.Timestamp;
  aiModel: string;                   // "gemini-2.5-flash"
  processingTimeMs: number;
}
```

**Index:**
- `newsId` (unique)
- `analyzedAt` (desc)

### 2. `breaking_news_locations` Collection (NEW)

```typescript
interface BreakingNewsLocation {
  // Document ID matches breaking_news_notifications document ID (1:1 mapping)
  breakingNewsId: string;           // Reference to breaking news document

  // Location hierarchy
  country: string;
  countryCode: string;
  state?: string;
  city?: string;

  // Geographic coordinates
  coordinates: {
    latitude: number;
    longitude: number;
  };

  // Location confidence
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  specificityLevel: 'CITY' | 'STATE' | 'COUNTRY';

  // Summary for popup
  locationSummary: string;
  breakingSummary: string;          // Brief summary of breaking event

  // Metadata
  analyzedAt: FirebaseFirestore.Timestamp;
  aiModel: string;
  processingTimeMs: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}
```

**Index:**
- `breakingNewsId` (unique)
- `analyzedAt` (desc)
- `severity` + `analyzedAt` (composite)

### 3. `conflict_zones` Collection (NEW)

```typescript
interface ConflictZone {
  // Document ID: auto-generated

  // Basic info
  name: string;                     // e.g., "Ukraine-Russia Border Region"
  description: string;              // Brief description of conflict

  // Location
  country: string;
  region?: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };

  // Conflict details
  conflictType: 'MILITARY' | 'CIVIL' | 'TERRITORIAL' | 'OTHER';
  status: 'ACTIVE' | 'ESCALATING' | 'DE_ESCALATING' | 'RESOLVED';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  // Parties involved
  parties: string[];                // e.g., ["Russia", "Ukraine"]

  // Temporal data
  startDate: FirebaseFirestore.Timestamp;
  lastUpdated: FirebaseFirestore.Timestamp;
  isActive: boolean;

  // Related news
  relatedNewsIds?: string[];        // References to news documents

  // Metadata
  source: string;                   // Data source
  verifiedBy?: string;              // Verification authority
}
```

**Indexes:**
- `isActive` + `severity` + `lastUpdated` (composite)
- `country`
- `status`

### 4. `users/{userId}/users_countries_locations` Subcollection (NEW)

**Important:** This is a **subcollection** under each user document. Does not modify the main `users` document structure.

**Trigger:** When user's `birthCountry`, `currentCountry`, or `currentState` is updated in the main `users` document, AI automatically generates coordinates and creates a new record.

**Versioning:** Multiple records allowed (historical tracking). Always use the most recent record (order by `createdAt desc`).

```typescript
interface UserCountryLocation {
  // Auto-generated document ID

  // User reference
  userId: string;                    // Parent user document ID

  // Birth country location
  birthCountry?: string;             // e.g., "China"
  birthCountryCode?: string;         // ISO 3166-1 alpha-2, e.g., "CN"
  birthCountryCapital?: {
    name: string;                    // e.g., "Beijing"
    coordinates: {
      latitude: number;              // e.g., 39.9042
      longitude: number;             // e.g., 116.4074
    };
  };

  // Current location
  currentCountry?: string;           // e.g., "United States"
  currentCountryCode?: string;       // e.g., "US"
  currentState?: string;             // e.g., "New York"
  currentStateCapital?: {
    name: string;                    // e.g., "Albany"
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  currentCountryCapital?: {
    name: string;                    // e.g., "Washington, D.C."
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };

  // Metadata
  createdAt: FirebaseFirestore.Timestamp;  // Sort by this (desc) to get latest
  aiModel: string;                   // "gemini-2.5-flash"
  processingTimeMs: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';

  // Source data snapshot (what triggered this record)
  sourceData: {
    birthCountry?: string;
    currentCountry?: string;
    currentState?: string;
  };
}
```

**Document Path Example:**
```
users/abc123/users_countries_locations/xyz789
users/abc123/users_countries_locations/xyz790  (newer record)
users/abc123/users_countries_locations/xyz791  (latest - use this one)
```

**Index:**
- `userId` + `createdAt` (desc) - to fetch latest location for a user
- `createdAt` (desc)

---

## Backend Services

### Cloud Functions

#### 1. `onNewsCreated` Trigger

**File:** `functions/src/news-location-analyzer.ts`

```typescript
import * as functions from 'firebase-functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Triggered when a new news document is created.
 * Analyzes the news content and extracts location information.
 */
export const onNewsCreated = functions.firestore
  .document('news/{newsId}')
  .onCreate(async (snapshot, context) => {
    const startTime = Date.now();
    const newsId = context.params.newsId;
    const newsData = snapshot.data();

    try {
      // Extract news content
      const content = `
        Title: ${newsData.title}
        Description: ${newsData.description || ''}
        Content: ${newsData.content || ''}
      `;

      // Call Gemini 2.5 Flash for location analysis
      const locationData = await analyzeNewsLocation(content);

      // Store in news_locations collection
      await getFirestore()
        .collection('news_locations')
        .doc(newsId)
        .set({
          newsId,
          ...locationData,
          analyzedAt: new Date(),
          aiModel: 'gemini-2.5-flash',
          processingTimeMs: Date.now() - startTime,
        });

      console.log(`✅ Location analyzed for news ${newsId}`);
    } catch (error) {
      console.error(`❌ Failed to analyze location for news ${newsId}:`, error);
      // Store error state
      await getFirestore()
        .collection('news_locations')
        .doc(newsId)
        .set({
          newsId,
          error: true,
          errorMessage: error.message,
          analyzedAt: new Date(),
        });
    }
  });

/**
 * Analyzes news content using Gemini 2.5 Flash to extract location.
 */
// Secret Manager setup (at top of file)
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretClient = new SecretManagerServiceClient();
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'GEMINI_API_KEY';

// Cache for Gemini API key
let geminiApiKey: string | null = null;

/**
 * Get Gemini API key from Google Secret Manager
 */
async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) {
    return geminiApiKey;
  }

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
    });

    const payload = version.payload?.data?.toString();
    if (payload) {
      geminiApiKey = payload;
      console.log('✅ Gemini API key loaded from Secret Manager');
      return payload;
    }
  } catch (error) {
    console.error('Failed to load Gemini API key from Secret Manager:', error);
  }

  return '';
}

async function analyzeNewsLocation(content: string) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Failed to load Gemini API key');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are a geolocation expert. Analyze the following news article and determine its primary geographic location.

News Article:
${content}

Extract:
1. Country (required)
2. State/Province (if mentioned or determinable)
3. City (if mentioned or determinable)
4. Precise latitude and longitude coordinates for the most specific location you can determine
5. Your confidence level in this location assessment
6. A brief location context (1 sentence)

Return ONLY valid JSON in this exact format:
{
  "country": "Country Name",
  "countryCode": "ISO 3166-1 alpha-2 code",
  "state": "State/Province or null",
  "city": "City name or null",
  "coordinates": {
    "latitude": 0.0,
    "longitude": 0.0
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "specificityLevel": "CITY|STATE|COUNTRY",
  "locationSummary": "Brief context about this location"
}

If the article doesn't have a clear geographic location, use the country most relevant to the story.
`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Parse JSON response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse location data from AI response');
  }

  return JSON.parse(jsonMatch[0]);
}
```

#### 2. `onBreakingNewsCreated` Trigger

**File:** `functions/src/breaking-news-location-analyzer.ts`

```typescript
/**
 * Triggered when a new breaking news notification is created.
 * Similar to onNewsCreated but includes severity assessment.
 */
export const onBreakingNewsCreated = functions.firestore
  .document('breaking_news_notifications/{breakingId}')
  .onCreate(async (snapshot, context) => {
    const startTime = Date.now();
    const breakingId = context.params.breakingId;
    const breakingData = snapshot.data();

    try {
      const content = `
        Title: ${breakingData.title}
        Description: ${breakingData.description || ''}
        Content: ${breakingData.content || ''}
      `;

      // Call Gemini for location + severity analysis
      const locationData = await analyzeBreakingNewsLocation(content);

      await getFirestore()
        .collection('breaking_news_locations')
        .doc(breakingId)
        .set({
          breakingNewsId: breakingId,
          ...locationData,
          analyzedAt: new Date(),
          aiModel: 'gemini-2.5-flash',
          processingTimeMs: Date.now() - startTime,
        });

      console.log(`✅ Location analyzed for breaking news ${breakingId}`);
    } catch (error) {
      console.error(`❌ Failed to analyze breaking news location ${breakingId}:`, error);
    }
  });

async function analyzeBreakingNewsLocation(content: string) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Failed to load Gemini API key');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are analyzing a BREAKING NEWS event. Extract location and assess severity.

Breaking News:
${content}

Extract:
1. Geographic location (Country → State → City)
2. Coordinates
3. Confidence level
4. Event severity (CRITICAL/HIGH/MEDIUM)
5. Brief summary of the breaking event (max 100 chars)
6. Location context

Return ONLY valid JSON:
{
  "country": "Country Name",
  "countryCode": "ISO code",
  "state": "State or null",
  "city": "City or null",
  "coordinates": {
    "latitude": 0.0,
    "longitude": 0.0
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "specificityLevel": "CITY|STATE|COUNTRY",
  "locationSummary": "Location context",
  "breakingSummary": "Brief event summary",
  "severity": "CRITICAL|HIGH|MEDIUM"
}
`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse breaking news location');

  return JSON.parse(jsonMatch[0]);
}
```

#### 3. `onUserLocationUpdated` Trigger

**File:** `functions/src/user-location-analyzer.ts`

```typescript
import * as functions from 'firebase-functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Triggered when user document is updated.
 * Detects changes to birthCountry, currentCountry, or currentState.
 * Generates coordinates and stores in users/{userId}/users_countries_locations subcollection.
 */
export const onUserLocationUpdated = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // Check if location-related fields changed
    const birthCountryChanged = beforeData.birthCountry !== afterData.birthCountry;
    const currentCountryChanged = beforeData.currentCountry !== afterData.currentCountry;
    const currentStateChanged = beforeData.currentState !== afterData.currentState;

    if (!birthCountryChanged && !currentCountryChanged && !currentStateChanged) {
      // No location changes, skip
      return null;
    }

    console.log(`📍 User location updated for ${userId}`);

    const startTime = Date.now();

    try {
      // Analyze locations using Gemini
      const locationData = await analyzeUserCountryLocations({
        birthCountry: afterData.birthCountry,
        currentCountry: afterData.currentCountry,
        currentState: afterData.currentState,
      });

      // Store in subcollection (creates new document each time)
      await getFirestore()
        .collection('users')
        .doc(userId)
        .collection('users_countries_locations')
        .add({
          userId,
          ...locationData,
          createdAt: FieldValue.serverTimestamp(),
          aiModel: 'gemini-2.5-flash',
          processingTimeMs: Date.now() - startTime,
          sourceData: {
            birthCountry: afterData.birthCountry,
            currentCountry: afterData.currentCountry,
            currentState: afterData.currentState,
          },
        });

      console.log(`✅ User location analyzed and stored for ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to analyze user location for ${userId}:`, error);
    }

    return null;
  });

/**
 * Analyzes user's birth and current country locations using Gemini 2.5 Flash.
 */
async function analyzeUserCountryLocations(userData: {
  birthCountry?: string;
  currentCountry?: string;
  currentState?: string;
}) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Failed to load Gemini API key');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are a geolocation expert. Generate precise location data for a user's geographic information.

User Data:
- Birth Country: ${userData.birthCountry || 'Not specified'}
- Current Country: ${userData.currentCountry || 'Not specified'}
- Current State: ${userData.currentState || 'Not specified'}

For each location provided, return:
1. Country name and ISO code
2. Capital city with coordinates
3. For current location: if state is provided, also include state capital with coordinates

Return ONLY valid JSON in this exact format:
{
  "birthCountry": "Full country name or null",
  "birthCountryCode": "ISO code or null",
  "birthCountryCapital": {
    "name": "Capital city name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,

  "currentCountry": "Full country name or null",
  "currentCountryCode": "ISO code or null",
  "currentState": "State name or null",
  "currentStateCapital": {
    "name": "State capital name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,
  "currentCountryCapital": {
    "name": "Country capital name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,

  "confidence": "HIGH|MEDIUM|LOW"
}

Examples:
- Birth Country "China" → birthCountryCapital: {"name": "Beijing", "coordinates": {"latitude": 39.9042, "longitude": 116.4074}}
- Current Country "United States", State "New York" → currentStateCapital: {"name": "Albany", "coordinates": {"latitude": 42.6526, "longitude": -73.7562}}, currentCountryCapital: {"name": "Washington, D.C.", "coordinates": {"latitude": 38.9072, "longitude": -77.0369}}
`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Parse JSON response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse user location data from AI response');
  }

  return JSON.parse(jsonMatch[0]);
}
```

#### 4. `getGlobeMarkers` API Endpoint

**File:** `functions/src/api/globe-markers.ts`

```typescript
import * as functions from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';

interface GlobeMarker {
  id: string;
  type: 'NEWS' | 'BREAKING' | 'CONFLICT' | 'USER_BIRTH' | 'USER_CURRENT';
  coordinates: { latitude: number; longitude: number };
  title: string;
  summary: string;
  metadata?: any;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  clickable: boolean;
  navigationTarget?: string; // News ID or URL
}

/**
 * Aggregates all globe markers for a user.
 * Returns: News (10), Breaking News, Conflict Zones, User locations
 */
export const getGlobeMarkers = functions.https.onCall(async (data, context) => {
  const userId = context.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const db = getFirestore();
  const markers: GlobeMarker[] = [];

  try {
    // 1. Get 10 most recent news locations
    const newsLocationsSnapshot = await db.collection('news_locations')
      .orderBy('analyzedAt', 'desc')
      .limit(10)
      .get();

    const newsIds = newsLocationsSnapshot.docs.map(doc => doc.data().newsId);
    const newsDocsPromises = newsIds.map(id => db.collection('news').doc(id).get());
    const newsDocs = await Promise.all(newsDocsPromises);

    newsLocationsSnapshot.forEach((doc, index) => {
      const location = doc.data();
      const newsDoc = newsDocs[index];
      const newsData = newsDoc.data();

      if (newsData) {
        markers.push({
          id: doc.id,
          type: 'NEWS',
          coordinates: location.coordinates,
          title: newsData.title,
          summary: location.locationSummary,
          metadata: {
            newsId: location.newsId,
            country: location.country,
            city: location.city,
            publishedAt: newsData.publishedAt,
          },
          clickable: true,
          navigationTarget: location.newsId,
        });
      }
    });

    // 2. Get recent breaking news locations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const breakingLocationsSnapshot = await db.collection('breaking_news_locations')
      .where('analyzedAt', '>=', sevenDaysAgo)
      .orderBy('analyzedAt', 'desc')
      .limit(20)
      .get();

    const breakingIds = breakingLocationsSnapshot.docs.map(doc => doc.data().breakingNewsId);
    const breakingDocsPromises = breakingIds.map(id =>
      db.collection('breaking_news_notifications').doc(id).get()
    );
    const breakingDocs = await Promise.all(breakingDocsPromises);

    breakingLocationsSnapshot.forEach((doc, index) => {
      const location = doc.data();
      const breakingDoc = breakingDocs[index];
      const breakingData = breakingDoc.data();

      if (breakingData) {
        markers.push({
          id: doc.id,
          type: 'BREAKING',
          coordinates: location.coordinates,
          title: breakingData.title,
          summary: location.breakingSummary,
          severity: location.severity,
          metadata: {
            breakingNewsId: location.breakingNewsId,
            country: location.country,
            city: location.city,
            timestamp: breakingData.timestamp,
          },
          clickable: true,
          navigationTarget: location.breakingNewsId,
        });
      }
    });

    // 3. Get active conflict zones
    const conflictZonesSnapshot = await db.collection('conflict_zones')
      .where('isActive', '==', true)
      .orderBy('severity', 'desc')
      .orderBy('lastUpdated', 'desc')
      .limit(15)
      .get();

    conflictZonesSnapshot.forEach(doc => {
      const conflict = doc.data();
      markers.push({
        id: doc.id,
        type: 'CONFLICT',
        coordinates: conflict.coordinates,
        title: conflict.name,
        summary: conflict.description,
        severity: conflict.severity,
        metadata: {
          conflictType: conflict.conflictType,
          status: conflict.status,
          parties: conflict.parties,
        },
        clickable: true,
      });
    });

    // 4. Get user's birth and current country from subcollection
    // Fetch the LATEST location record (most recent createdAt)
    const userLocationSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('users_countries_locations')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (!userLocationSnapshot.empty) {
      const userLocation = userLocationSnapshot.docs[0].data();

      // Add birth country marker
      if (userLocation.birthCountryCapital) {
        markers.push({
          id: `user-birth-${userId}`,
          type: 'USER_BIRTH',
          coordinates: userLocation.birthCountryCapital.coordinates,
          title: `Birth Country: ${userLocation.birthCountry}`,
          summary: `Capital: ${userLocation.birthCountryCapital.name}`,
          metadata: {
            country: userLocation.birthCountry,
            countryCode: userLocation.birthCountryCode,
          },
          clickable: true,
        });
      }

      // Add current country/state marker
      // Prefer state capital if available, otherwise country capital
      if (userLocation.currentStateCapital) {
        markers.push({
          id: `user-current-${userId}`,
          type: 'USER_CURRENT',
          coordinates: userLocation.currentStateCapital.coordinates,
          title: `Current: ${userLocation.currentState}, ${userLocation.currentCountry}`,
          summary: `State Capital: ${userLocation.currentStateCapital.name}`,
          metadata: {
            country: userLocation.currentCountry,
            state: userLocation.currentState,
            countryCode: userLocation.currentCountryCode,
          },
          clickable: true,
        });
      } else if (userLocation.currentCountryCapital) {
        markers.push({
          id: `user-current-${userId}`,
          type: 'USER_CURRENT',
          coordinates: userLocation.currentCountryCapital.coordinates,
          title: `Current Country: ${userLocation.currentCountry}`,
          summary: `Capital: ${userLocation.currentCountryCapital.name}`,
          metadata: {
            country: userLocation.currentCountry,
            countryCode: userLocation.currentCountryCode,
          },
          clickable: true,
        });
      }
    }

    return {
      success: true,
      markers,
      count: markers.length,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Error fetching globe markers:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch globe markers');
  }
});
```

#### 4. `initializeUserLocations` Batch Service (One-time migration)

**File:** `functions/src/scripts/initialize-user-locations.ts`

```typescript
/**
 * One-time batch script to initialize location data for existing users.
 * Should be run manually after deploying the onUserLocationUpdated trigger.
 *
 * Run: npx ts-node src/scripts/initialize-user-locations.ts
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Firebase Admin
initializeApp({
  credential: cert(require('../../../serviceAccountKey.json'))
});

const db = getFirestore();

async function initializeUserLocations() {
  console.log('🚀 Starting user location initialization...\n');

  try {
    // Fetch all users who have birthCountry or currentCountry
    const usersSnapshot = await db.collection('users')
      .where('birthCountry', '!=', null)
      .get();

    console.log(`Found ${usersSnapshot.size} users with location data\n`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      // Skip if user already has location records
      const existingLocations = await db
        .collection('users')
        .doc(userId)
        .collection('users_countries_locations')
        .limit(1)
        .get();

      if (!existingLocations.empty) {
        console.log(`⏭️  Skipping ${userId} - already has location data`);
        continue;
      }

      try {
        console.log(`📍 Processing user ${userId}...`);

        const startTime = Date.now();

        // Analyze location
        const locationData = await analyzeUserCountryLocations({
          birthCountry: userData.birthCountry,
          currentCountry: userData.currentCountry,
          currentState: userData.currentState,
        });

        // Store in subcollection
        await db
          .collection('users')
          .doc(userId)
          .collection('users_countries_locations')
          .add({
            userId,
            ...locationData,
            createdAt: FieldValue.serverTimestamp(),
            aiModel: 'gemini-2.5-flash',
            processingTimeMs: Date.now() - startTime,
            sourceData: {
              birthCountry: userData.birthCountry,
              currentCountry: userData.currentCountry,
              currentState: userData.currentState,
            },
          });

        console.log(`✅ Success for ${userId} (${Date.now() - startTime}ms)\n`);
        succeeded++;

      } catch (error) {
        console.error(`❌ Failed for ${userId}:`, error.message);
        failed++;
      }

      processed++;

      // Rate limiting: wait 1 second between requests to avoid API quota
      if (processed % 10 === 0) {
        console.log(`\n--- Progress: ${processed}/${usersSnapshot.size} (${succeeded} succeeded, ${failed} failed) ---\n`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n✅ Initialization complete!');
    console.log(`Total: ${processed}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed: ${failed}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

async function analyzeUserCountryLocations(userData: {
  birthCountry?: string;
  currentCountry?: string;
  currentState?: string;
}) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Failed to load Gemini API key');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are a geolocation expert. Generate precise location data for a user's geographic information.

User Data:
- Birth Country: ${userData.birthCountry || 'Not specified'}
- Current Country: ${userData.currentCountry || 'Not specified'}
- Current State: ${userData.currentState || 'Not specified'}

For each location provided, return:
1. Country name and ISO code
2. Capital city with coordinates
3. For current location: if state is provided, also include state capital with coordinates

Return ONLY valid JSON in this exact format:
{
  "birthCountry": "Full country name or null",
  "birthCountryCode": "ISO code or null",
  "birthCountryCapital": {
    "name": "Capital city name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,

  "currentCountry": "Full country name or null",
  "currentCountryCode": "ISO code or null",
  "currentState": "State name or null",
  "currentStateCapital": {
    "name": "State capital name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,
  "currentCountryCapital": {
    "name": "Country capital name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,

  "confidence": "HIGH|MEDIUM|LOW"
}
`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const jsonMatch = response.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('Failed to parse user location data from AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

// Run the script
initializeUserLocations()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
```

**Usage:**
```bash
# Set environment variable
export GEMINI_API_KEY="your-api-key"

# Run the script from functions directory
cd functions
npx ts-node src/scripts/initialize-user-locations.ts
```

#### 5. `analyzeEntityLocation` API Endpoint

**File:** `functions/src/api/entity-location-analyzer.ts`

```typescript
/**
 * Analyzes the geographic location of a searched entity.
 * Used when user searches for a person, company, or organization.
 */
export const analyzeEntityLocation = functions.https.onCall(async (data, context) => {
  const { entityName, entityType } = data;

  if (!entityName) {
    throw new functions.https.HttpsError('invalid-argument', 'Entity name is required');
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
You are a geolocation expert. Determine the primary geographic location associated with this entity.

Entity: ${entityName}
Type: ${entityType || 'Unknown'}

For a person: Their primary residence or headquarters
For a company: Headquarters location
For an organization: Main office or operational center

Return ONLY valid JSON:
{
  "country": "Country Name",
  "countryCode": "ISO code",
  "state": "State or null",
  "city": "City or null",
  "coordinates": {
    "latitude": 0.0,
    "longitude": 0.0
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "specificityLevel": "CITY|STATE|COUNTRY",
  "locationSummary": "Brief context about this location",
  "entitySummary": "Brief 1-sentence summary of the entity"
}
`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Failed to parse entity location');
    }

    return {
      success: true,
      data: JSON.parse(jsonMatch[0]),
    };

  } catch (error) {
    console.error('Error analyzing entity location:', error);
    throw new functions.https.HttpsError('internal', 'Failed to analyze entity location');
  }
});
```

---

## Frontend Implementation

### 1. Enhanced Globe Service

**File:** `services/globeService.ts`

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

export interface GlobeMarker {
  id: string;
  type: 'NEWS' | 'BREAKING' | 'CONFLICT' | 'USER_BIRTH' | 'USER_CURRENT' | 'SEARCH_RESULT';
  coordinates: { latitude: number; longitude: number };
  title: string;
  summary: string;
  metadata?: any;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  clickable: boolean;
  navigationTarget?: string;
}

/**
 * Fetches all globe markers for the authenticated user
 */
export async function fetchGlobeMarkers(): Promise<GlobeMarker[]> {
  const functions = getFunctions();
  const getMarkersFunc = httpsCallable(functions, 'getGlobeMarkers');

  try {
    const result = await getMarkersFunc();
    const data = result.data as { success: boolean; markers: GlobeMarker[] };

    if (data.success) {
      return data.markers;
    }

    throw new Error('Failed to fetch globe markers');
  } catch (error) {
    console.error('Error fetching globe markers:', error);
    return [];
  }
}

/**
 * Analyzes entity location for search results
 */
export async function analyzeEntityLocation(
  entityName: string,
  entityType?: string
): Promise<GlobeMarker | null> {
  const functions = getFunctions();
  const analyzeFunc = httpsCallable(functions, 'analyzeEntityLocation');

  try {
    const result = await analyzeFunc({ entityName, entityType });
    const data = result.data as { success: boolean; data: any };

    if (data.success && data.data) {
      return {
        id: `search-${Date.now()}`,
        type: 'SEARCH_RESULT',
        coordinates: data.data.coordinates,
        title: entityName,
        summary: data.data.entitySummary,
        metadata: {
          country: data.data.country,
          city: data.data.city,
          locationSummary: data.data.locationSummary,
        },
        clickable: true,
      };
    }

    return null;
  } catch (error) {
    console.error('Error analyzing entity location:', error);
    return null;
  }
}
```

### 2. Enhanced GlobeViewer Component

**File:** `components/globe/GlobeViewer.tsx`

Add marker rendering and interaction:

```typescript
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { GlobeMarker } from '../../services/globeService';

interface GlobeViewerProps {
  markers?: GlobeMarker[];
  onMarkerClick?: (marker: GlobeMarker) => void;
}

// Convert lat/lng to 3D coordinates on sphere
function latLngToVector3(lat: number, lng: number, radius: number = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// Marker component
function Marker({ marker, onClick }: { marker: GlobeMarker; onClick: () => void }) {
  const markerRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const position = latLngToVector3(
    marker.coordinates.latitude,
    marker.coordinates.longitude,
    1.02 // Slightly above earth surface
  );

  // Marker color based on type
  const color = useMemo(() => {
    switch (marker.type) {
      case 'NEWS': return '#3b82f6'; // blue
      case 'BREAKING': return '#ef4444'; // red
      case 'CONFLICT': return '#dc2626'; // dark red
      case 'USER_BIRTH': return '#10b981'; // green
      case 'USER_CURRENT': return '#8b5cf6'; // purple
      case 'SEARCH_RESULT': return '#f59e0b'; // orange
      default: return '#6b7280'; // gray
    }
  }, [marker.type]);

  // Pulsing animation for breaking/conflict
  useFrame(({ clock }) => {
    if (markerRef.current && (marker.type === 'BREAKING' || marker.type === 'CONFLICT')) {
      const scale = 1 + Math.sin(clock.elapsedTime * 2) * 0.2;
      markerRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh
      ref={markerRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[0.02, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={hovered ? 0.8 : 0.4}
      />

      {/* Popup on hover */}
      {hovered && (
        <Html distanceFactor={10} position={[0, 0.05, 0]}>
          <div
            className="bg-black text-white px-3 py-2 rounded border-2 border-white"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              maxWidth: '200px',
              pointerEvents: 'none',
            }}
          >
            <div className="font-bold mb-1">{marker.title}</div>
            <div className="text-gray-300 text-[9px]">{marker.summary}</div>
          </div>
        </Html>
      )}
    </mesh>
  );
}

// Enhanced Earth component
function EarthWithBorders({ topoData, markers, onMarkerClick }: {
  topoData: any;
  markers: GlobeMarker[];
  onMarkerClick: (marker: GlobeMarker) => void;
}) {
  const earthRef = useRef<THREE.Mesh>(null);

  // ... existing earth rendering code ...

  useFrame(() => {
    if (earthRef.current) {
      earthRef.current.rotation.y += 0.003;
    }
  });

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial map={earthTexture} />
      </mesh>

      {/* Render markers */}
      {markers.map(marker => (
        <Marker
          key={marker.id}
          marker={marker}
          onClick={() => onMarkerClick(marker)}
        />
      ))}
    </group>
  );
}

export function GlobeViewer({ markers = [], onMarkerClick }: GlobeViewerProps) {
  const [topoData, setTopoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ... existing loading logic ...

  const handleMarkerClick = (marker: GlobeMarker) => {
    console.log('Marker clicked:', marker);
    onMarkerClick?.(marker);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas camera={{ position: [0, 0, 3.0], fov: 45 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 3, 5]} intensity={1.0} />

        <EarthWithBorders
          topoData={topoData}
          markers={markers}
          onMarkerClick={handleMarkerClick}
        />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={2.0}
          maxDistance={4.0}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
        />
      </Canvas>
    </div>
  );
}
```

### 3. Enhanced SenseView Integration

**File:** `components/views/SenseView.tsx`

Update to load and display markers:

```typescript
import { fetchGlobeMarkers, analyzeEntityLocation, GlobeMarker } from '../../services/globeService';

export const SenseView: React.FC<SenseViewProps> = ({ ... }) => {
  const [globeMarkers, setGlobeMarkers] = useState<GlobeMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<GlobeMarker | null>(null);

  // Load globe markers on mount
  useEffect(() => {
    loadGlobeMarkers();
  }, []);

  const loadGlobeMarkers = async () => {
    const markers = await fetchGlobeMarkers();
    setGlobeMarkers(markers);
  };

  // Handle search - add entity location to markers
  const handleScan = async () => {
    if (!query.trim()) {
      openCamera();
      return;
    }

    setLoading(true);
    setResult(null);
    setFecData(null);

    try {
      // Existing brand analysis
      const [brandData, fecResult] = await Promise.all([
        analyzeBrandAlignment(query, userProfile, userDemographics, user?.uid),
        queryCompanyFECData(query)
      ]);
      setResult(brandData);
      setFecData(fecResult);

      // NEW: Analyze entity location and add to globe
      const entityMarker = await analyzeEntityLocation(query);
      if (entityMarker) {
        setGlobeMarkers(prev => [
          entityMarker,
          ...prev.filter(m => m.type !== 'SEARCH_RESULT') // Remove previous search
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Handle marker click
  const handleMarkerClick = (marker: GlobeMarker) => {
    setSelectedMarker(marker);

    // Navigate to news if applicable
    if (marker.navigationTarget && (marker.type === 'NEWS' || marker.type === 'BREAKING')) {
      // You can either navigate to FeedView or open a modal
      console.log('Navigate to news:', marker.navigationTarget);
      // onNavigate(ViewState.FEED, { newsId: marker.navigationTarget });
    }
  };

  return (
    <div className="flex flex-col space-y-8 max-w-lg promax:max-w-xl mx-auto w-full">
      {/* ... existing search UI ... */}

      {/* Globe Viewer with markers */}
      <PixelCard className="!p-0">
        <div className="px-6 pt-6 pb-4">
          <div className="font-mono text-xs font-bold uppercase tracking-wide flex items-center gap-2">
            <Globe size={14} />
            {t('sense', 'globe_title')}
            <span className="ml-auto text-[10px] opacity-50">
              {globeMarkers.length} {t('sense', 'globe_markers_count')}
            </span>
          </div>
        </div>
        <div style={{ height: '450px', width: '100%' }}>
          <Suspense fallback={<div>Loading globe...</div>}>
            <GlobeViewer
              markers={globeMarkers}
              onMarkerClick={handleMarkerClick}
            />
          </Suspense>
        </div>
        <p className="font-mono text-[10px] text-gray-500 text-center py-4">
          {t('sense', 'globe_hint')}
        </p>
      </PixelCard>

      {/* Marker Detail Modal */}
      {selectedMarker && (
        <MarkerDetailModal
          marker={selectedMarker}
          onClose={() => setSelectedMarker(null)}
          onNavigate={onNavigate}
        />
      )}

      {/* ... existing result display ... */}
    </div>
  );
};
```

### 4. Marker Detail Modal Component

**File:** `components/globe/MarkerDetailModal.tsx`

```typescript
import React from 'react';
import { X, MapPin, AlertTriangle, Newspaper } from 'lucide-react';
import { GlobeMarker } from '../../services/globeService';
import { ViewState } from '../../types';

interface MarkerDetailModalProps {
  marker: GlobeMarker;
  onClose: () => void;
  onNavigate: (view: ViewState, params?: any) => void;
}

export const MarkerDetailModal: React.FC<MarkerDetailModalProps> = ({
  marker,
  onClose,
  onNavigate
}) => {
  const { t } = useLanguage();

  const getMarkerIcon = () => {
    switch (marker.type) {
      case 'NEWS':
      case 'BREAKING':
        return <Newspaper size={16} />;
      case 'CONFLICT':
        return <AlertTriangle size={16} />;
      default:
        return <MapPin size={16} />;
    }
  };

  const getMarkerColor = () => {
    switch (marker.type) {
      case 'BREAKING':
      case 'CONFLICT':
        return 'border-red-500 bg-red-50';
      case 'NEWS':
        return 'border-blue-500 bg-blue-50';
      case 'USER_BIRTH':
      case 'USER_CURRENT':
        return 'border-green-500 bg-green-50';
      case 'SEARCH_RESULT':
        return 'border-orange-500 bg-orange-50';
      default:
        return 'border-gray-500 bg-gray-50';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className={`relative bg-white border-4 ${getMarkerColor()} shadow-pixel max-w-md w-full animate-fade-in`}>
        {/* Header */}
        <div className="bg-black text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {getMarkerIcon()}
            <span className="font-pixel text-sm uppercase">{marker.type.replace('_', ' ')}</span>
          </div>
          <button onClick={onClose} className="hover:opacity-70">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <div className="font-pixel text-xl mb-2">{marker.title}</div>
            <p className="font-mono text-xs text-gray-600">{marker.summary}</p>
          </div>

          {marker.metadata?.country && (
            <div className="border-t-2 border-black/10 pt-4">
              <div className="font-mono text-[10px] uppercase text-gray-500 mb-1">
                {t('sense', 'marker_location')}
              </div>
              <div className="font-mono text-xs">
                {[marker.metadata.city, marker.metadata.state, marker.metadata.country]
                  .filter(Boolean)
                  .join(', ')}
              </div>
              <div className="font-mono text-[10px] text-gray-400 mt-1">
                {marker.coordinates.latitude.toFixed(4)}°, {marker.coordinates.longitude.toFixed(4)}°
              </div>
            </div>
          )}

          {marker.severity && (
            <div className="border-t-2 border-black/10 pt-4">
              <div className="font-mono text-[10px] uppercase text-gray-500 mb-1">
                {t('sense', 'marker_severity')}
              </div>
              <div className={`inline-block px-3 py-1 font-mono text-xs font-bold border-2 ${
                marker.severity === 'CRITICAL' ? 'border-red-600 bg-red-100 text-red-700' :
                marker.severity === 'HIGH' ? 'border-orange-600 bg-orange-100 text-orange-700' :
                'border-yellow-600 bg-yellow-100 text-yellow-700'
              }`}>
                {marker.severity}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {marker.navigationTarget && (
          <div className="border-t-2 border-black p-4">
            <button
              onClick={() => {
                onNavigate(ViewState.FEED, { newsId: marker.navigationTarget });
                onClose();
              }}
              className="w-full py-3 bg-black text-white font-mono text-xs uppercase hover:bg-gray-800 transition-colors"
            >
              {t('sense', 'marker_view_article')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## Data Flow

### 1. News Location Analysis Flow

```
New News Article Created
        ↓
onNewsCreated Trigger Fires
        ↓
Extract news content (title, description, content)
        ↓
Call Gemini 2.5 Flash API
        ↓
AI analyzes content and returns:
  - Country (required)
  - State/Province (if determinable)
  - City (if determinable)
  - Coordinates (lat/lng)
  - Confidence level
  - Location summary
        ↓
Store in news_locations collection
  Document ID = News Document ID (1:1 mapping)
        ↓
Frontend queries news_locations via getGlobeMarkers
        ↓
Display on globe
```

### 2. User Search Flow

```
User searches for "Tesla"
        ↓
analyzeBrandAlignment (existing)
        ↓
NEW: analyzeEntityLocation("Tesla")
        ↓
Gemini 2.5 Flash determines:
  - Tesla HQ in Austin, Texas
  - Coordinates: 30.2672°N, 97.7431°W
  - Entity summary
        ↓
Add SEARCH_RESULT marker to globe
        ↓
User clicks marker
        ↓
Show MarkerDetailModal with entity info
```

### 3. Globe Rendering Flow

```
SenseView mounts
        ↓
useEffect → fetchGlobeMarkers()
        ↓
Call Cloud Function: getGlobeMarkers
        ↓
Function aggregates:
  - 10 recent news locations
  - Recent breaking news (7 days)
  - Active conflict zones
  - User's birth/current country
        ↓
Return GlobeMarker[] array
        ↓
Pass to GlobeViewer component
        ↓
For each marker:
  - Convert lat/lng to 3D coordinates
  - Render sphere at position
  - Add hover popup
  - Add click handler
        ↓
User interaction handled
```

---

## Implementation Plan

### Phase 1: Database & Backend Setup (Week 1)

1. **Create new Firestore collections**
   - `news_locations`
   - `breaking_news_locations`
   - `conflict_zones`
   - Add indexes

2. **Implement Cloud Functions**
   - `onNewsCreated` trigger
   - `onBreakingNewsCreated` trigger
   - `getGlobeMarkers` API
   - `analyzeEntityLocation` API

3. **Test AI location extraction**
   - Test with sample news articles
   - Validate coordinate accuracy
   - Monitor Gemini API costs

### Phase 2: Frontend Globe Enhancement (Week 2)

1. **Create globe service**
   - `fetchGlobeMarkers()`
   - `analyzeEntityLocation()`

2. **Enhance GlobeViewer component**
   - Marker rendering system
   - Lat/lng to 3D coordinate conversion
   - Hover popups
   - Click handlers
   - Marker color coding

3. **Create MarkerDetailModal**
   - Display marker details
   - Navigation to news articles
   - Severity indicators

### Phase 3: Integration (Week 3)

1. **Update SenseView**
   - Load markers on mount
   - Integrate with search
   - Handle marker clicks

2. **User location setup**
   - Update onboarding to collect birth/current country
   - Store capital coordinates in user profile

3. **Conflict zones data**
   - Populate initial conflict zones
   - Create admin panel for updates

### Phase 4: Testing & Optimization (Week 4)

1. **Performance testing**
   - Globe rendering with 50+ markers
   - Lazy loading optimization
   - Mobile performance

2. **Accuracy testing**
   - Validate AI location extraction
   - Test edge cases
   - User feedback collection

3. **Polish**
   - Animations
   - Visual refinements
   - Error handling

---

## Performance Optimization

### 1. Globe Rendering

- **Marker instancing:** Use THREE.js InstancedMesh for rendering many markers efficiently
- **Level of Detail:** Reduce marker geometry complexity at distance
- **Frustum culling:** Only render markers in view
- **Texture optimization:** Use compressed textures for earth surface

### 2. Data Loading

- **Pagination:** Load markers in batches as user zooms in
- **Caching:** Cache getGlobeMarkers response for 5 minutes
- **Lazy loading:** Load globe component only when SenseView is active
- **Web Workers:** Offload coordinate calculations to worker threads

### 3. AI Calls

- **Batching:** Process multiple news articles in single Gemini call
- **Caching:** Cache location results for duplicate news
- **Rate limiting:** Implement exponential backoff for API calls
- **Model selection:** Use Gemini 2.5 Flash (fastest, cheapest)

### 4. Database Queries

- **Composite indexes:** Optimize queries with proper indexes
- **Limit results:** Cap at 10 news, 20 breaking, 15 conflicts
- **Denormalization:** Store news titles in locations collection to avoid joins

---

## Security Considerations

### 1. API Security

- **Authentication:** All Cloud Functions require Firebase Auth
- **Rate limiting:** Implement per-user rate limits
  - getGlobeMarkers: 10 calls/minute
  - analyzeEntityLocation: 5 calls/minute
- **Input validation:** Sanitize all user inputs
- **API key protection:** Use Cloud Functions for Gemini calls (never client-side)

### 2. Data Privacy

- **User locations:** Only show user's own locations, not others'
- **PII protection:** Don't include user names in markers
- **Access control:** Firestore rules restrict location collections

### 3. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // News locations - read only
    match /news_locations/{docId} {
      allow read: if request.auth != null;
      allow write: if false; // Only Cloud Functions can write
    }

    // Breaking news locations - read only
    match /breaking_news_locations/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // Conflict zones - read only
    match /conflict_zones/{docId} {
      allow read: if request.auth != null;
      allow write: if false; // Only admins via Cloud Functions
    }

    // Users - protect location data
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow update: if request.auth.uid == userId;

      // User country locations subcollection - read own data only
      match /users_countries_locations/{locationId} {
        allow read: if request.auth.uid == userId;
        allow write: if false; // Only Cloud Functions can write
      }
    }
  }
}
```

### 4. Cost Management

- **Gemini API:** Monitor usage, set budget alerts
- **Cloud Functions:** Use appropriate memory/CPU allocations
- **Firestore reads:** Implement caching to reduce read costs
- **Storage:** Set TTL for old location data (e.g., 90 days)

---

## Monitoring & Analytics

### 1. Metrics to Track

- **AI Performance:**
  - Location extraction accuracy
  - Processing time per article
  - Gemini API error rate
  - Cost per analysis

- **User Engagement:**
  - Globe marker clicks
  - Most viewed marker types
  - Search → location analysis conversion rate
  - Average markers displayed per session

- **System Performance:**
  - Globe rendering FPS
  - API response times
  - Cache hit rates
  - Error rates

### 2. Logging

```typescript
// In Cloud Functions
console.log('LOCATION_ANALYSIS', {
  newsId,
  processingTimeMs,
  confidence,
  specificityLevel,
  aiModel: 'gemini-2.5-flash',
});

// In Frontend
console.log('GLOBE_INTERACTION', {
  action: 'marker_click',
  markerType: marker.type,
  userId: user?.uid,
  timestamp: new Date().toISOString(),
});
```

### 3. Error Handling

- **Graceful degradation:** Show globe even if markers fail to load
- **Retry logic:** Retry failed AI calls with exponential backoff
- **User notifications:** Show toast for critical errors
- **Fallback locations:** Use country-level if city/state can't be determined

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Marker Clustering**
   - Group nearby markers when zoomed out
   - Show count badge on clusters
   - Expand on click

2. **Historical Timeline**
   - Scrub timeline to see markers from past weeks
   - Animate marker appearance/disappearance
   - "Replay" major events

3. **Heatmap Layer**
   - Visualize news density
   - Conflict intensity overlay
   - User interest heatmap

4. **Custom Filters**
   - Toggle marker types on/off
   - Filter by severity
   - Filter by date range

5. **AR Globe View**
   - Use device camera as background
   - Overlay globe in AR space
   - Gesture controls

6. **Social Sharing**
   - Share specific globe state (markers visible)
   - Generate static image of globe view
   - Share interesting locations

---

## Cost Estimates

### Gemini API Costs (2.5 Flash)

- **Input:** $0.0001875 / 1K characters
- **Output:** $0.00075 / 1K characters

**Assumptions:**
- Average news article: 2,000 characters
- AI response: 300 characters
- 1,000 news articles/day
- 500 breaking news/day
- 200 entity searches/day

**Daily Costs:**
```
News: 1000 × (2000×0.0001875 + 300×0.00075) = $0.60/day
Breaking: 500 × (2000×0.0001875 + 300×0.00075) = $0.30/day
Entity: 200 × (500×0.0001875 + 300×0.00075) = $0.06/day

Total: ~$1/day = ~$30/month
```

### Firestore Costs

- Reads: ~50K/day = $0.18/day
- Writes: ~1.5K/day = $0.05/day
- Storage: ~1GB = $0.18/month

**Total Firestore: ~$7/month**

### Cloud Functions Costs

- Invocations: ~2K/day = $0.08/day
- Compute: Minimal (Flash model is fast)

**Total Functions: ~$3/month**

### **Grand Total: ~$40/month at scale**

---

## Conclusion

The Global Intelligence Map feature provides users with an immersive, interactive way to explore geopolitical intelligence. By leveraging:

- **Gemini 2.5 Flash** for fast, accurate location extraction
- **Three.js/React Three Fiber** for smooth 3D rendering
- **Firebase** for scalable data storage
- **Cloud Functions** for automated processing

We can deliver a compelling feature that enhances the Stanse intelligence platform.

**Key Benefits:**
✅ Visual intelligence at a glance
✅ Real-time breaking news tracking
✅ Conflict zone awareness
✅ Personalized user context
✅ Seamless search integration

**Next Steps:**
1. Review and approve this design
2. Begin Phase 1 implementation
3. Set up monitoring and cost tracking
4. Iterate based on user feedback

---

**Questions for Discussion:**

1. Should we limit the number of search result markers visible at once?
2. Do we want to add marker animations (pulsing for breaking news, etc.)?
3. Should conflict zones be user-reported or admin-curated only?
4. How long should we retain location data (30/60/90 days)?
5. Should we implement marker clustering from Day 1 or in Phase 2?

---

*End of Technical Design Document*
