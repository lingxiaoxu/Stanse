"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobeMarkers = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
/**
 * Aggregates all globe markers for a user.
 * Returns: News (10), Breaking News, Conflict Zones, User locations
 */
exports.getGlobeMarkers = functions.https.onCall(async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const db = admin.firestore();
    const markers = [];
    try {
        // 1. Get 10 most recent news locations
        const newsLocationsSnapshot = await db.collection('news_locations')
            .where('error', '==', false)
            .orderBy('analyzedAt', 'desc')
            .limit(10)
            .get()
            .catch(() => {
            // If index doesn't exist yet, try without the error filter
            return db.collection('news_locations')
                .orderBy('analyzedAt', 'desc')
                .limit(10)
                .get();
        });
        const newsIds = newsLocationsSnapshot.docs
            .map(doc => doc.data().newsId)
            .filter(id => id);
        const newsDocsPromises = newsIds.map(id => db.collection('news').doc(id).get());
        const newsDocs = await Promise.all(newsDocsPromises);
        newsLocationsSnapshot.docs.forEach((doc, index) => {
            const location = doc.data();
            if (location.error)
                return; // Skip error documents
            const newsDoc = newsDocs[index];
            const newsData = newsDoc?.data();
            if (newsData && location.coordinates) {
                markers.push({
                    id: doc.id,
                    type: 'NEWS',
                    coordinates: location.coordinates,
                    title: newsData.title || 'Untitled',
                    summary: location.locationSummary || `${location.city || location.state || location.country}`,
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
            .get()
            .catch(() => {
            // If query fails, get all and filter client-side
            return db.collection('breaking_news_locations')
                .orderBy('analyzedAt', 'desc')
                .limit(20)
                .get();
        });
        const breakingIds = breakingLocationsSnapshot.docs
            .map(doc => doc.data().breakingNewsId)
            .filter(id => id);
        const breakingDocsPromises = breakingIds.map(id => db.collection('breaking_news_notifications').doc(id).get());
        const breakingDocs = await Promise.all(breakingDocsPromises);
        breakingLocationsSnapshot.docs.forEach((doc, index) => {
            const location = doc.data();
            if (location.error)
                return; // Skip error documents
            const breakingDoc = breakingDocs[index];
            const breakingData = breakingDoc?.data();
            if (breakingData && location.coordinates) {
                markers.push({
                    id: doc.id,
                    type: 'BREAKING',
                    coordinates: location.coordinates,
                    title: breakingData.title || 'Breaking News',
                    summary: location.breakingSummary || location.locationSummary || '',
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
            .get()
            .catch(() => {
            // If query fails (no index), just get recent ones
            return db.collection('conflict_zones')
                .limit(15)
                .get();
        });
        conflictZonesSnapshot.forEach(doc => {
            const conflict = doc.data();
            if (conflict.coordinates) {
                markers.push({
                    id: doc.id,
                    type: 'CONFLICT',
                    coordinates: conflict.coordinates,
                    title: conflict.name || 'Conflict Zone',
                    summary: conflict.description || '',
                    severity: conflict.severity,
                    metadata: {
                        conflictType: conflict.conflictType,
                        status: conflict.status,
                        parties: conflict.parties,
                    },
                    clickable: true,
                });
            }
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
            if (userLocation.birthCountryCapital && userLocation.birthCountryCapital.coordinates) {
                markers.push({
                    id: `user-birth-${userId}`,
                    type: 'USER_BIRTH',
                    coordinates: userLocation.birthCountryCapital.coordinates,
                    title: `Birth Country: ${userLocation.birthCountry || 'Unknown'}`,
                    summary: `Capital: ${userLocation.birthCountryCapital.name || 'N/A'}`,
                    metadata: {
                        country: userLocation.birthCountry,
                        countryCode: userLocation.birthCountryCode,
                    },
                    clickable: true,
                });
            }
            // Add current country/state marker
            // Prefer state capital if available, otherwise country capital
            if (userLocation.currentStateCapital && userLocation.currentStateCapital.coordinates) {
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
            }
            else if (userLocation.currentCountryCapital && userLocation.currentCountryCapital.coordinates) {
                markers.push({
                    id: `user-current-${userId}`,
                    type: 'USER_CURRENT',
                    coordinates: userLocation.currentCountryCapital.coordinates,
                    title: `Current Country: ${userLocation.currentCountry || 'Unknown'}`,
                    summary: `Capital: ${userLocation.currentCountryCapital.name || 'N/A'}`,
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
    }
    catch (error) {
        console.error('Error fetching globe markers:', error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch globe markers: ' + error.message);
    }
});
//# sourceMappingURL=globe-markers.js.map