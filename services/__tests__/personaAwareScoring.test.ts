/**
 * Test suite for Persona-Aware Scoring Module
 *
 * Tests:
 * 1. Dynamic weight redistribution
 * 2. Persona-aware FEC scoring
 * 3. Persona-aware ESG scoring
 * 4. Full integration test
 */

import {
  calculateDynamicWeights,
  calculateFECScorePersonaAware,
  calculateESGScorePersonaAware,
  calculateExecutiveScorePersonaAware,
  calculateNewsScorePersonaAware,
  calculatePersonaAwareScore,
  DataAvailability,
} from '../personaAwareScoring';
import { PERSONA_CONFIGS } from '../personaScoringConfig';

describe('Persona-Aware Scoring Tests', () => {
  // ============================================================================
  // Test 1: Dynamic Weight Redistribution
  // ============================================================================

  test('Dynamic weights: All 4 sources available', () => {
    const availability: DataAvailability = {
      hasFEC: true,
      hasESG: true,
      hasExecutive: true,
      hasNews: true,
    };

    const weights = calculateDynamicWeights(availability);

    // Should match original weights
    expect(weights.fec).toBeCloseTo(0.4, 2);
    expect(weights.esg).toBeCloseTo(0.3, 2);
    expect(weights.executive).toBeCloseTo(0.2, 2);
    expect(weights.news).toBeCloseTo(0.1, 2);

    // Should sum to 1.0
    const sum = weights.fec + weights.esg + weights.executive + weights.news;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  test('Dynamic weights: Only FEC + ESG available', () => {
    const availability: DataAvailability = {
      hasFEC: true,
      hasESG: true,
      hasExecutive: false,
      hasNews: false,
    };

    const weights = calculateDynamicWeights(availability);

    // FEC should get 0.4 / (0.4 + 0.3) = 0.571
    // ESG should get 0.3 / (0.4 + 0.3) = 0.429
    expect(weights.fec).toBeCloseTo(0.571, 2);
    expect(weights.esg).toBeCloseTo(0.429, 2);
    expect(weights.executive).toBe(0);
    expect(weights.news).toBe(0);

    // Should still sum to 1.0
    const sum = weights.fec + weights.esg + weights.executive + weights.news;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  test('Dynamic weights: Only FEC available', () => {
    const availability: DataAvailability = {
      hasFEC: true,
      hasESG: false,
      hasExecutive: false,
      hasNews: false,
    };

    const weights = calculateDynamicWeights(availability);

    // FEC should get 100%
    expect(weights.fec).toBeCloseTo(1.0, 5);
    expect(weights.esg).toBe(0);
    expect(weights.executive).toBe(0);
    expect(weights.news).toBe(0);
  });

  test('Dynamic weights: No data available', () => {
    const availability: DataAvailability = {
      hasFEC: false,
      hasESG: false,
      hasExecutive: false,
      hasNews: false,
    };

    const weights = calculateDynamicWeights(availability);

    // All should be 0
    expect(weights.fec).toBe(0);
    expect(weights.esg).toBe(0);
    expect(weights.executive).toBe(0);
    expect(weights.news).toBe(0);
  });

  // ============================================================================
  // Test 2: FEC Scoring (Persona-Aware)
  // ============================================================================

  test('FEC Score: Progressive-globalist prefers DEM donations', () => {
    const fecData = {
      total_amount: 100000, // $1000 in cents
      dem_amount: 70000,    // 70% DEM
      rep_amount: 30000,    // 30% GOP
    };

    const score = calculateFECScorePersonaAware(fecData, 'progressive-globalist');

    expect(score).not.toBeNull();
    // Should be high (progressive likes DEM donations)
    expect(score!).toBeGreaterThan(60);
  });

  test('FEC Score: Conservative-nationalist prefers GOP donations', () => {
    const fecData = {
      total_amount: 100000, // $1000 in cents
      dem_amount: 30000,    // 30% DEM
      rep_amount: 70000,    // 70% GOP
    };

    const score = calculateFECScorePersonaAware(fecData, 'conservative-nationalist');

    expect(score).not.toBeNull();
    // Should be high (conservative likes GOP donations)
    expect(score!).toBeGreaterThan(60);
  });

  test('FEC Score: Same company, different personas → different scores', () => {
    const fecData = {
      total_amount: 100000,
      dem_amount: 70000,
      rep_amount: 30000,
    };

    const progressiveScore = calculateFECScorePersonaAware(fecData, 'progressive-globalist');
    const conservativeScore = calculateFECScorePersonaAware(fecData, 'conservative-nationalist');

    expect(progressiveScore).not.toBeNull();
    expect(conservativeScore).not.toBeNull();

    // Progressive should score higher for DEM-heavy donations
    expect(progressiveScore!).toBeGreaterThan(conservativeScore!);
  });

  test('FEC Score: No data returns null', () => {
    const score = calculateFECScorePersonaAware(null, 'progressive-globalist');
    expect(score).toBeNull();
  });

  // ============================================================================
  // Test 3: ESG Scoring (Persona-Aware)
  // ============================================================================

  test('ESG Score: Progressive prefers high ESG', () => {
    const esgData = {
      environmentalScore: 80,
      socialScore: 85,
      governanceScore: 75,
    };

    const score = calculateESGScorePersonaAware(esgData, 'progressive-globalist');

    expect(score).not.toBeNull();
    // Should be high (progressive values high ESG)
    expect(score!).toBeGreaterThan(70);
  });

  test('ESG Score: Conservative skeptical of high ESG', () => {
    const esgData = {
      environmentalScore: 80,
      socialScore: 85,
      governanceScore: 75,
    };

    const score = calculateESGScorePersonaAware(esgData, 'conservative-nationalist');

    expect(score).not.toBeNull();
    // Should be lower (conservative doesn't value high ESG as much)
    expect(score!).toBeLessThan(60);
  });

  test('ESG Score: No data returns null', () => {
    const score = calculateESGScorePersonaAware(null, 'progressive-globalist');
    expect(score).toBeNull();
  });

  // ============================================================================
  // Test 4: Full Integration Test
  // ============================================================================

  test('Full Integration: All data available', () => {
    const fecData = {
      total_amount: 500000,
      dem_amount: 350000,
      rep_amount: 150000,
    };

    const esgData = {
      environmentalScore: 75,
      socialScore: 80,
      governanceScore: 70,
    };

    const execData = {
      has_executive_statements: true,
      political_stance: {
        overall_leaning: 'progressive',
        confidence: 75,
      },
      recommendation_score: 72,
    };

    const newsData = [
      { title: 'Article 1' },
      { title: 'Article 2' },
      { title: 'Article 3' },
    ];

    const result = calculatePersonaAwareScore(
      fecData,
      esgData,
      execData,
      newsData,
      'progressive-globalist'
    );

    // Should have all data
    expect(result.hasAnyData).toBe(true);
    expect(result.dataSourceCount).toBe(4);

    // All scores should be non-null
    expect(result.fecScore).not.toBeNull();
    expect(result.esgScore).not.toBeNull();
    expect(result.executiveScore).not.toBeNull();
    expect(result.newsScore).not.toBeNull();

    // Numerical score should be in valid range
    expect(result.numericalScore).toBeGreaterThanOrEqual(0);
    expect(result.numericalScore).toBeLessThanOrEqual(100);

    // Weights should sum to 1.0
    const weightSum =
      result.usedWeights.fec +
      result.usedWeights.esg +
      result.usedWeights.executive +
      result.usedWeights.news;
    expect(weightSum).toBeCloseTo(1.0, 5);
  });

  test('Full Integration: Only FEC and ESG available', () => {
    const fecData = {
      total_amount: 500000,
      dem_amount: 350000,
      rep_amount: 150000,
    };

    const esgData = {
      environmentalScore: 75,
      socialScore: 80,
      governanceScore: 70,
    };

    const result = calculatePersonaAwareScore(
      fecData,
      esgData,
      null,
      [],
      'progressive-globalist'
    );

    // Should have data from 2 sources
    expect(result.hasAnyData).toBe(true);
    expect(result.dataSourceCount).toBe(2);

    // Only FEC and ESG should be non-null
    expect(result.fecScore).not.toBeNull();
    expect(result.esgScore).not.toBeNull();
    expect(result.executiveScore).toBeNull();
    expect(result.newsScore).toBeNull();

    // Weights should be redistributed
    expect(result.usedWeights.fec).toBeCloseTo(0.571, 2);
    expect(result.usedWeights.esg).toBeCloseTo(0.429, 2);
    expect(result.usedWeights.executive).toBe(0);
    expect(result.usedWeights.news).toBe(0);

    // Numerical score should still be valid
    expect(result.numericalScore).toBeGreaterThanOrEqual(0);
    expect(result.numericalScore).toBeLessThanOrEqual(100);
  });

  test('Full Integration: No data available', () => {
    const result = calculatePersonaAwareScore(
      null,
      null,
      null,
      [],
      'progressive-globalist'
    );

    // Should have no data
    expect(result.hasAnyData).toBe(false);
    expect(result.dataSourceCount).toBe(0);

    // All scores should be null
    expect(result.fecScore).toBeNull();
    expect(result.esgScore).toBeNull();
    expect(result.executiveScore).toBeNull();
    expect(result.newsScore).toBeNull();

    // Should default to neutral 50
    expect(result.numericalScore).toBe(50);
  });

  // ============================================================================
  // Test 5: Persona Config Validation
  // ============================================================================

  test('All 8 personas have valid configs', () => {
    const personas = [
      'progressive-globalist',
      'progressive-nationalist',
      'socialist-libertarian',
      'socialist-nationalist',
      'capitalist-globalist',
      'capitalist-nationalist',
      'conservative-globalist',
      'conservative-nationalist',
    ] as const;

    personas.forEach((persona) => {
      const config = PERSONA_CONFIGS[persona];

      // Validate FEC config
      expect(config.fec.partyPreference).toBeGreaterThanOrEqual(-1);
      expect(config.fec.partyPreference).toBeLessThanOrEqual(1);
      expect(config.fec.amountSensitivity).toBeGreaterThanOrEqual(0);
      expect(config.fec.amountSensitivity).toBeLessThanOrEqual(1);

      // Validate ESG config
      expect(config.esg.environmentalWeight).toBeGreaterThanOrEqual(0);
      expect(config.esg.socialWeight).toBeGreaterThanOrEqual(0);
      expect(config.esg.governanceWeight).toBeGreaterThanOrEqual(0);
      expect(config.esg.esgImportance).toBeGreaterThanOrEqual(0);
      expect(config.esg.esgImportance).toBeLessThanOrEqual(1);
      expect(typeof config.esg.preferHighESG).toBe('boolean');

      // Validate Executive config
      expect(Array.isArray(config.executive.preferredLeanings)).toBe(true);
      expect(config.executive.confidenceThreshold).toBeGreaterThanOrEqual(0);
      expect(config.executive.confidenceThreshold).toBeLessThanOrEqual(100);

      // Validate News config
      expect(config.news.sentimentPreference).toBeGreaterThanOrEqual(-1);
      expect(config.news.sentimentPreference).toBeLessThanOrEqual(1);
      expect(config.news.newsImportance).toBeGreaterThanOrEqual(0);
      expect(config.news.newsImportance).toBeLessThanOrEqual(1);
    });
  });
});
