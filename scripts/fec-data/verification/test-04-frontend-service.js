/**
 * Test 04: Frontend FEC Service Integration Test
 *
 * Tests the FEC service integration for the frontend Sense tab
 * Tests company name normalization and Firestore queries with validated companies
 *
 * Usage: cd verification && node test-04-frontend-service.js
 * Location: scripts/fec-data/verification/
 */

import { queryCompanyFECData } from '../../../services/fecService.js';

const TEST_COMPANIES = [
  'JPMorgan Chase',
  'JPM',
  'Microsoft',
  'MSFT',
  'Microsoft Corporation',
  'Google',
  'Google Inc',
  'Alphabet',
  'Goldman Sachs',
  'Boeing',
  'Lockheed Martin',
  'Amazon',
  'Apple',
  'Meta',
];

console.log('🧪 Testing FEC Service with Validated Companies\n');
console.log('=' .repeat(80));

async function testCompany(companyName) {
  console.log(`\n🔍 Testing: "${companyName}"`);
  console.log('-'.repeat(80));

  try {
    const data = await queryCompanyFECData(companyName);

    if (data) {
      console.log(`✅ FOUND DATA`);
      console.log(`   Display Name: ${data.display_name}`);
      console.log(`   Normalized: ${data.normalized_name}`);
      console.log(`   Total Contributions: $${data.total_usd.toLocaleString()}`);
      console.log(`   Years: ${data.years[0]}-${data.years[data.years.length - 1]}`);
      console.log(`   Party Breakdown:`);

      // Sort by percentage descending
      const sortedParties = Object.entries(data.party_totals)
        .sort(([, a], [, b]) => b.percentage - a.percentage);

      for (const [party, partyData] of sortedParties) {
        console.log(`     ${party}: ${partyData.percentage.toFixed(1)}% ($${partyData.total_amount_usd.toLocaleString()})`);
      }
    } else {
      console.log(`❌ NO DATA FOUND`);
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
  }
}

async function runTests() {
  for (const company of TEST_COMPANIES) {
    await testCompany(company);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Testing complete!');
}

runTests();
