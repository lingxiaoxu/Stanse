/**
 * Globe Intelligence Map - Browser Testing Utilities
 *
 * These utilities can be imported and called from the browser console for testing.
 * They help admin users test location analysis and globe markers functionality.
 *
 * Usage in browser console:
 *   import { testUserLocation, testGlobeMarkers, testEntityLocation } from '/utils/globeTestUtils.ts'
 *   await testUserLocation('user123')
 *   await testGlobeMarkers('user123')
 *   await testEntityLocation('Tesla')
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

/**
 * Test user location analysis
 * Fetches and displays the latest location record for a user
 */
export async function testUserLocation(userId: string) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🧪 Testing User Location for: ${userId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const db = getFirestore();
    const locationsRef = collection(db, 'users', userId, 'users_countries_locations');
    const q = query(locationsRef, orderBy('createdAt', 'desc'), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('❌ No location records found for this user');
      console.log('💡 Tip: Update user\'s birthCountry or currentCountry to trigger location analysis');
      return null;
    }

    const locationData = snapshot.docs[0].data();

    console.log('\n📍 Latest Location Record:');
    console.table({
      'User ID': locationData.userId,
      'Birth Country': locationData.birthCountry || 'N/A',
      'Birth Capital': locationData.birthCountryCapital?.name || 'N/A',
      'Birth Coords': locationData.birthCountryCapital ?
        `${locationData.birthCountryCapital.coordinates.latitude}, ${locationData.birthCountryCapital.coordinates.longitude}` : 'N/A',
      'Current Country': locationData.currentCountry || 'N/A',
      'Current State': locationData.currentState || 'N/A',
      'State Capital': locationData.currentStateCapital?.name || 'N/A',
      'State Coords': locationData.currentStateCapital ?
        `${locationData.currentStateCapital.coordinates.latitude}, ${locationData.currentStateCapital.coordinates.longitude}` : 'N/A',
      'Country Capital': locationData.currentCountryCapital?.name || 'N/A',
      'Confidence': locationData.confidence,
      'AI Model': locationData.aiModel,
      'Processing Time': `${locationData.processingTimeMs}ms`,
    });

    console.log('\n📊 Full Data:');
    console.log(locationData);

    console.log('\n✅ Test Complete');
    return locationData;
  } catch (error: any) {
    console.error('❌ Error testing user location:', error.message);
    console.error(error);
    return null;
  }
}

/**
 * Test globe markers API
 * Fetches all markers for a user and displays summary
 */
export async function testGlobeMarkers(userId?: string) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌍 Testing Globe Markers API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const functions = getFunctions();
    const getMarkersFunc = httpsCallable(functions, 'getGlobeMarkers');

    console.log('⏳ Calling getGlobeMarkers Cloud Function...');
    const result = await getMarkersFunc();
    const data = result.data as any;

    if (!data.success) {
      console.error('❌ API call failed:', data);
      return null;
    }

    const markers = data.markers || [];

    console.log(`\n✅ Retrieved ${markers.length} markers`);
    console.log(`⏰ Timestamp: ${data.timestamp}`);

    // Group markers by type
    const markersByType: Record<string, number> = {};
    markers.forEach((marker: any) => {
      markersByType[marker.type] = (markersByType[marker.type] || 0) + 1;
    });

    console.log('\n📊 Markers by Type:');
    console.table(markersByType);

    console.log('\n📍 Sample Markers:');
    markers.slice(0, 5).forEach((marker: any) => {
      console.log(`  ${marker.type}: ${marker.title}`);
      console.log(`    → ${marker.coordinates.latitude}, ${marker.coordinates.longitude}`);
      console.log(`    → ${marker.summary}`);
    });

    if (markers.length > 5) {
      console.log(`  ... and ${markers.length - 5} more markers`);
    }

    console.log('\n🔍 Full marker list:');
    console.table(markers.map((m: any) => ({
      Type: m.type,
      Title: m.title.substring(0, 40),
      Lat: m.coordinates.latitude.toFixed(4),
      Lng: m.coordinates.longitude.toFixed(4),
      Severity: m.severity || 'N/A',
    })));

    console.log('\n✅ Test Complete');
    return markers;
  } catch (error: any) {
    console.error('❌ Error testing globe markers:', error.message);
    console.error(error);
    return null;
  }
}

/**
 * Test entity location analysis
 * Analyzes the location of a searched entity (company, person, organization)
 */
export async function testEntityLocation(entityName: string, entityType?: string) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔍 Testing Entity Location Analysis`);
  console.log(`📌 Entity: ${entityName}`);
  if (entityType) console.log(`📌 Type: ${entityType}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const functions = getFunctions();
    const analyzeFunc = httpsCallable(functions, 'analyzeEntityLocation');

    console.log('⏳ Calling analyzeEntityLocation Cloud Function...');
    const result = await analyzeFunc({ entityName, entityType });
    const response = result.data as any;

    if (!response.success) {
      console.error('❌ API call failed:', response);
      return null;
    }

    const locationData = response.data;

    console.log('\n✅ Location Analysis Complete');
    console.table({
      'Entity': entityName,
      'Country': locationData.country,
      'State': locationData.state || 'N/A',
      'City': locationData.city || 'N/A',
      'Latitude': locationData.coordinates.latitude,
      'Longitude': locationData.coordinates.longitude,
      'Confidence': locationData.confidence,
      'Specificity': locationData.specificityLevel,
    });

    console.log('\n📝 Location Summary:');
    console.log(`  ${locationData.locationSummary}`);

    console.log('\n📝 Entity Summary:');
    console.log(`  ${locationData.entitySummary}`);

    console.log('\n🔍 Full Data:');
    console.log(locationData);

    console.log('\n✅ Test Complete');
    return locationData;
  } catch (error: any) {
    console.error('❌ Error testing entity location:', error.message);
    console.error(error);
    return null;
  }
}

/**
 * Test news location analysis
 * Fetches recent news locations and displays statistics
 */
export async function testNewsLocations(limit: number = 10) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📰 Testing News Locations (limit: ${limit})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const db = getFirestore();
    const locationsRef = collection(db, 'news_locations');
    const q = query(locationsRef, orderBy('analyzedAt', 'desc'), limit(limit));
    const snapshot = await getDocs(q);

    console.log(`\n✅ Retrieved ${snapshot.size} news locations`);

    const locations = snapshot.docs.map(doc => doc.data());

    // Statistics
    const stats = {
      total: locations.length,
      byConfidence: {} as Record<string, number>,
      bySpecificity: {} as Record<string, number>,
      byCountry: {} as Record<string, number>,
      errors: locations.filter(l => l.error).length,
    };

    locations.forEach(loc => {
      if (loc.error) return;

      stats.byConfidence[loc.confidence] = (stats.byConfidence[loc.confidence] || 0) + 1;
      stats.bySpecificity[loc.specificityLevel] = (stats.bySpecificity[loc.specificityLevel] || 0) + 1;
      stats.byCountry[loc.country] = (stats.byCountry[loc.country] || 0) + 1;
    });

    console.log('\n📊 Confidence Distribution:');
    console.table(stats.byConfidence);

    console.log('\n📊 Specificity Distribution:');
    console.table(stats.bySpecificity);

    console.log('\n📊 Top Countries:');
    const topCountries = Object.entries(stats.byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    console.table(Object.fromEntries(topCountries));

    console.log(`\n⚠️  Errors: ${stats.errors}`);

    console.log('\n📍 Sample Locations:');
    console.table(locations.slice(0, 5).map(loc => ({
      NewsID: loc.newsId?.substring(0, 10),
      Country: loc.country,
      City: loc.city || 'N/A',
      Confidence: loc.confidence,
      Specificity: loc.specificityLevel,
      ProcessingTime: `${loc.processingTimeMs}ms`,
    })));

    console.log('\n✅ Test Complete');
    return { stats, locations };
  } catch (error: any) {
    console.error('❌ Error testing news locations:', error.message);
    console.error(error);
    return null;
  }
}

/**
 * Run all tests
 * Comprehensive test suite for Globe Intelligence Map
 */
export async function runAllGlobeTests(userId: string) {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  Globe Intelligence Map - Full Test Suite ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const results = {
    userLocation: null as any,
    globeMarkers: null as any,
    entityLocation: null as any,
    newsLocations: null as any,
  };

  console.log('\n[1/4] Testing User Location...');
  results.userLocation = await testUserLocation(userId);

  console.log('\n[2/4] Testing Globe Markers...');
  results.globeMarkers = await testGlobeMarkers(userId);

  console.log('\n[3/4] Testing Entity Location (Tesla)...');
  results.entityLocation = await testEntityLocation('Tesla', 'company');

  console.log('\n[4/4] Testing News Locations...');
  results.newsLocations = await testNewsLocations(20);

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║           Test Suite Complete             ║');
  console.log('╚═══════════════════════════════════════════╝');

  console.log('\n📊 Summary:');
  console.table({
    'User Location': results.userLocation ? '✅ Pass' : '❌ Fail',
    'Globe Markers': results.globeMarkers ? '✅ Pass' : '❌ Fail',
    'Entity Location': results.entityLocation ? '✅ Pass' : '❌ Fail',
    'News Locations': results.newsLocations ? '✅ Pass' : '❌ Fail',
  });

  return results;
}

// Make functions available globally for easy browser console access
if (typeof window !== 'undefined') {
  (window as any).globeTests = {
    testUserLocation,
    testGlobeMarkers,
    testEntityLocation,
    testNewsLocations,
    runAllGlobeTests,
  };

  console.log('✅ Globe test utilities loaded!');
  console.log('📚 Available functions:');
  console.log('  • globeTests.testUserLocation(userId)');
  console.log('  • globeTests.testGlobeMarkers()');
  console.log('  • globeTests.testEntityLocation(entityName)');
  console.log('  • globeTests.testNewsLocations(limit)');
  console.log('  • globeTests.runAllGlobeTests(userId)');
}
