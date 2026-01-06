#!/usr/bin/env node
/**
 * Generate Revenue Report
 *
 * This script generates a comprehensive revenue report from the revenue collection.
 *
 * Usage:
 *   npx tsx scripts/subscription/generate-revenue-report.ts [period]
 *
 * Examples:
 *   npx tsx scripts/subscription/generate-revenue-report.ts           # All time
 *   npx tsx scripts/subscription/generate-revenue-report.ts 2026-01   # Specific month
 */

import admin from 'firebase-admin';

try {
  admin.app();
} catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function generateReport(period?: string) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Revenue Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(period ? `Period: ${period}` : 'Period: All Time');
  console.log('');

  let query = db.collection('revenue').orderBy('timestamp', 'desc');

  if (period) {
    query = query.where('period', '==', period) as any;
  }

  const snapshot = await query.get();

  if (snapshot.empty) {
    console.log('No revenue records found');
    return;
  }

  console.log(`Found ${snapshot.size} revenue records\n`);

  // Aggregate data
  let totalRevenue = 0;
  let totalCharged = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const byType: Record<string, { count: number; revenue: number; charged: number }> = {};
  const byPeriod: Record<string, { revenue: number; charged: number; records: number }> = {};

  snapshot.docs.forEach((doc) => {
    const data = doc.data();

    totalRevenue += data.totalRevenue || 0;
    totalCharged += data.chargedCount || 0;
    totalSkipped += data.skippedCount || 0;
    totalErrors += data.errorCount || 0;

    // By type
    if (!byType[data.type]) {
      byType[data.type] = { count: 0, revenue: 0, charged: 0 };
    }
    byType[data.type].count++;
    byType[data.type].revenue += data.totalRevenue || 0;
    byType[data.type].charged += data.chargedCount || 0;

    // By period
    if (!byPeriod[data.period]) {
      byPeriod[data.period] = { revenue: 0, charged: 0, records: 0 };
    }
    byPeriod[data.period].revenue += data.totalRevenue || 0;
    byPeriod[data.period].charged += data.chargedCount || 0;
    byPeriod[data.period].records++;
  });

  // Print summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Overall Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`Total Users Charged: ${totalCharged}`);
  console.log(`Total Skipped: ${totalSkipped}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log(`Average Revenue per Charge: $${(totalRevenue / totalCharged || 0).toFixed(2)}`);
  console.log('');

  // By type
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Revenue by Type');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Object.entries(byType).forEach(([type, stats]) => {
    console.log(`${type}:`);
    console.log(`  Runs: ${stats.count}`);
    console.log(`  Revenue: $${stats.revenue.toFixed(2)}`);
    console.log(`  Users Charged: ${stats.charged}`);
    console.log(`  Avg per Run: $${(stats.revenue / stats.count).toFixed(2)}`);
    console.log('');
  });

  // By period
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Revenue by Period');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Object.entries(byPeriod)
    .sort(([a], [b]) => b.localeCompare(a)) // Sort newest first
    .forEach(([period, stats]) => {
      console.log(`${period}:`);
      console.log(`  Revenue: $${stats.revenue.toFixed(2)}`);
      console.log(`  Users Charged: ${stats.charged}`);
      console.log(`  Billing Runs: ${stats.records}`);
      console.log('');
    });

  // Recent records
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Recent Records (Last 10)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  snapshot.docs.slice(0, 10).forEach((doc) => {
    const data = doc.data();
    const date = new Date(data.timestamp).toLocaleString();
    console.log(`${date} - ${data.type}`);
    console.log(`  Period: ${data.period}`);
    console.log(`  Revenue: $${data.totalRevenue.toFixed(2)} (${data.chargedCount} users)`);
    console.log(`  Skipped: ${data.skippedCount}, Errors: ${data.errorCount}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

const period = process.argv[2];
generateReport(period)
  .then(() => {
    console.log('✅ Report generated successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Report generation failed:', error);
    process.exit(1);
  });
