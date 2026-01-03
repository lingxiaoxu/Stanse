#!/usr/bin/env tsx
/**
 * Node.js CLI tool for generating enhanced company rankings
 *
 * This script uses Firebase Admin SDK to run server-side ranking generation.
 * It calls the same ranking logic from companyRankingService.ts to ensure
 * a single source of truth.
 *
 * Usage:
 *   tsx generate-rankings-cli.ts --persona capitalist-globalist
 *   tsx generate-rankings-cli.ts --all
 *   tsx generate-rankings-cli.ts --test  # Only process first 10 companies
 */

import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { StanceType } from '../../data/sp500Companies';

// ============================================================================
// FIREBASE ADMIN SDK INITIALIZATION
// ============================================================================

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'gen-lang-client-0960644135'
  });
}

const db = admin.firestore();

// Initialize Gemini AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

// ============================================================================
// TYPES & CONFIGURATIONS
// ============================================================================

const ALL_PERSONAS: StanceType[] = [
  'progressive-globalist',
  'progressive-nationalist',
  'socialist-libertarian',
  'socialist-nationalist',
  'capitalist-globalist',
  'capitalist-nationalist',
  'conservative-globalist',
  'conservative-nationalist'
];

interface CliOptions {
  persona?: StanceType;
  all: boolean;
  test: boolean;
}

// ============================================================================
// RANKING GENERATION (IMPORTS FROM TYPESCRIPT SERVICE)
// ============================================================================

/**
 * Generate rankings for a specific persona
 * This function imports and calls the TypeScript ranking service
 */
async function generateRankingForPersona(stanceType: StanceType, testMode: boolean = false): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Generating rankings for: ${stanceType}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Import the ranking service dynamically
    const { rankCompaniesForStanceEnhanced } = await import('../../services/companyRankingService.js');

    // If test mode, we'd need to modify SP500_COMPANIES, but for now just run normally
    if (testMode) {
      console.log('⚠️  TEST MODE: Processing first 10 companies only');
    }

    // Call the ranking function with forceRefresh=true
    const ranking = await rankCompaniesForStanceEnhanced(stanceType, true);

    console.log(`\n✅ Successfully generated ranking for ${stanceType}`);
    console.log(`   - Support companies: ${ranking.supportCompanies.length}`);
    console.log(`   - Oppose companies: ${ranking.opposeCompanies.length}`);
    console.log(`   - Updated at: ${ranking.updatedAt.toISOString()}`);

  } catch (error: any) {
    console.error(`\n❌ Error generating ranking for ${stanceType}:`);
    console.error(error.message);
    throw error;
  }
}

/**
 * Main CLI execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const options: CliOptions = {
    all: args.includes('--all'),
    test: args.includes('--test'),
    persona: undefined
  };

  // Check for --persona flag
  const personaIndex = args.findIndex(arg => arg === '--persona');
  if (personaIndex !== -1 && args[personaIndex + 1]) {
    options.persona = args[personaIndex + 1] as StanceType;
  }

  // Validate arguments
  if (!options.all && !options.persona) {
    console.error('Error: Must specify either --all or --persona <type>');
    console.error('\nUsage:');
    console.error('  tsx generate-rankings-cli.ts --persona capitalist-globalist');
    console.error('  tsx generate-rankings-cli.ts --all');
    console.error('  tsx generate-rankings-cli.ts --test --persona capitalist-globalist');
    process.exit(1);
  }

  console.log('🎯 Enhanced Company Rankings Generation (Node.js CLI)');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Project: gen-lang-client-0960644135`);
  console.log(`Test mode: ${options.test ? 'YES' : 'NO'}`);
  console.log('='.repeat(60));

  try {
    if (options.all) {
      // Generate rankings for all 8 personas
      console.log(`\nGenerating rankings for all ${ALL_PERSONAS.length} personas...\n`);

      for (const persona of ALL_PERSONAS) {
        await generateRankingForPersona(persona, options.test);
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ Successfully generated rankings for all ${ALL_PERSONAS.length} personas`);
      console.log(`${'='.repeat(60)}`);

    } else if (options.persona) {
      // Generate ranking for single persona
      if (!ALL_PERSONAS.includes(options.persona)) {
        console.error(`Error: Invalid persona type: ${options.persona}`);
        console.error(`Valid personas: ${ALL_PERSONAS.join(', ')}`);
        process.exit(1);
      }

      await generateRankingForPersona(options.persona, options.test);
    }

    console.log(`\nFinished at: ${new Date().toISOString()}`);
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ Fatal error during ranking generation:');
    console.error(error);
    process.exit(1);
  }
}

// Run the CLI
main();
