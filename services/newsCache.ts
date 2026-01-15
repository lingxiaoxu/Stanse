import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { NewsEvent } from '../types';

const NEWS_COLLECTION = 'news';
const NEWS_IMAGES_COLLECTION = 'news_images';
const NEWS_IMAGE_GENERATION_COLLECTION = 'news_image_generation';

// Hash function to create a unique ID for news based on title
const hashTitle = (title: string): string => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    const char = title.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
};

/**
 * Check if a news item exists in cache by title hash
 */
export const getNewsFromCache = async (titleHash: string): Promise<NewsEvent | null> => {
  try {
    const docRef = doc(db, NEWS_COLLECTION, titleHash);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as NewsEvent;
    }
    return null;
  } catch (error) {
    console.error('Error getting news from cache:', error);
    return null;
  }
};

/**
 * Save a news item to cache
 */
export const saveNewsToCache = async (news: NewsEvent): Promise<void> => {
  try {
    const titleHash = hashTitle(news.title);
    const docRef = doc(db, NEWS_COLLECTION, titleHash);

    await setDoc(docRef, {
      ...news,
      titleHash,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error saving news to cache:', error);
  }
};

/**
 * Get cached image for a news title
 * Now uses AI-generated images from news_image_generation collection
 */
export const getImageFromCache = async (titleHash: string): Promise<string | null> => {
  try {
    // First check old cache
    const docRef = doc(db, NEWS_IMAGES_COLLECTION, titleHash);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const imageUrl = docSnap.data().imageUrl as string;
      // Only return if it's from the new AI-generated images (Firebase Storage)
      if (imageUrl && imageUrl.includes('storage.googleapis.com/stanse-public-assets/news_images')) {
        return imageUrl;
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting image from cache:', error);
    return null;
  }
};

/**
 * Save image to cache
 * Only saves AI-generated images (from Firebase Storage)
 */
export const saveImageToCache = async (titleHash: string, imageUrl: string): Promise<void> => {
  try {
    // Only cache AI-generated images from our Firebase Storage
    if (!imageUrl.includes('storage.googleapis.com/stanse-public-assets/news_images')) {
      return; // Skip caching non-AI images
    }

    const docRef = doc(db, NEWS_IMAGES_COLLECTION, titleHash);

    await setDoc(docRef, {
      titleHash,
      imageUrl,
      source: 'ai-generated', // Mark as AI-generated
      createdAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error saving image to cache:', error);
  }
};

/**
 * Get recent news from cache by category
 */
export const getRecentNewsByCategory = async (
  category: string,
  maxResults: number = 10
): Promise<NewsEvent[]> => {
  try {
    const q = query(
      collection(db, NEWS_COLLECTION),
      where('category', '==', category),
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as NewsEvent);
  } catch (error) {
    console.error('Error getting recent news:', error);
    return [];
  }
};

/**
 * Get mixed recent news from cache
 */
export const getRecentMixedNews = async (maxResults: number = 5): Promise<NewsEvent[]> => {
  try {
    const q = query(
      collection(db, NEWS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(maxResults * 2) // Get more to shuffle
    );

    const querySnapshot = await getDocs(q);
    const allNews = querySnapshot.docs.map(doc => doc.data() as NewsEvent);

    // Shuffle and return
    return allNews.sort(() => Math.random() - 0.5).slice(0, maxResults);
  } catch (error) {
    console.error('Error getting mixed news:', error);
    return [];
  }
};

/**
 * Create title hash (exported for use in other services)
 */
export const createTitleHash = hashTitle;

/**
 * Delete all news from the last N hours
 * Used to clean up fake/generated news before populating with real news
 */
export const deleteRecentNews = async (hoursAgo: number = 12): Promise<{ deleted: number }> => {
  try {
    const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const cutoffTimestamp = Timestamp.fromDate(cutoffTime);

    const q = query(
      collection(db, NEWS_COLLECTION),
      where('createdAt', '>=', cutoffTimestamp),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    let deleted = 0;

    for (const docSnapshot of querySnapshot.docs) {
      await deleteDoc(doc(db, NEWS_COLLECTION, docSnapshot.id));
      deleted++;
      const newsData = docSnapshot.data();
      console.log(`Deleted: ${newsData.title?.slice(0, 50)}...`);
    }

    console.log(`Deleted ${deleted} news items from the last ${hoursAgo} hours`);
    return { deleted };
  } catch (error) {
    console.error('Error deleting recent news:', error);
    return { deleted: 0 };
  }
};

/**
 * Delete ALL news from database (use with caution)
 */
export const deleteAllNews = async (): Promise<{ deleted: number }> => {
  try {
    const q = query(
      collection(db, NEWS_COLLECTION),
      limit(500) // Process in batches
    );

    const querySnapshot = await getDocs(q);
    let deleted = 0;

    for (const docSnapshot of querySnapshot.docs) {
      await deleteDoc(doc(db, NEWS_COLLECTION, docSnapshot.id));
      deleted++;
    }

    console.log(`Deleted ${deleted} news items total`);
    return { deleted };
  } catch (error) {
    console.error('Error deleting all news:', error);
    return { deleted: 0 };
  }
};

/**
 * Check if an image URL is stale (broken services)
 */
export const isStaleImageUrl = (imageUrl: string | undefined | null): boolean => {
  if (!imageUrl) return true;
  return (
    imageUrl.includes('source.unsplash') ||   // Dynamic Unsplash (broken 503)
    imageUrl.includes('picsum.photos') ||     // Picsum (returns 405)
    imageUrl.includes('loremflickr.com') ||   // LoremFlickr (302 redirect issues)
    imageUrl.includes('placehold.co')         // Placeholder (too simple, not news-like)
  );
};

/**
 * Clean all stale image URLs from Firestore news collection
 * This is triggered automatically when fetching news
 */
export const cleanStaleNewsImages = async (
  generateNewImage: (title: string, category: string) => Promise<string | null>,
  defaultImageUrl: string
): Promise<{ cleaned: number; total: number }> => {
  try {
    const q = query(
      collection(db, NEWS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(100) // Process up to 100 at a time
    );

    const querySnapshot = await getDocs(q);
    let cleaned = 0;
    const total = querySnapshot.size;

    for (const docSnapshot of querySnapshot.docs) {
      const newsData = docSnapshot.data() as NewsEvent & { titleHash?: string };

      if (isStaleImageUrl(newsData.imageUrl)) {
        // Generate new image
        const newImageUrl = await generateNewImage(newsData.title, newsData.category);
        const finalImageUrl = newImageUrl || defaultImageUrl;

        // Update the news document
        const docRef = doc(db, NEWS_COLLECTION, docSnapshot.id);
        await setDoc(docRef, {
          ...newsData,
          imageUrl: finalImageUrl,
          updatedAt: Timestamp.now()
        }, { merge: true });

        // Also update the images collection if titleHash exists
        if (newsData.titleHash) {
          await saveImageToCache(newsData.titleHash, finalImageUrl);
        }

        cleaned++;
        console.log(`Cleaned image for: ${newsData.title.slice(0, 40)}...`);
      }
    }

    console.log(`Image cleanup complete: ${cleaned}/${total} news items updated`);
    return { cleaned, total };
  } catch (error) {
    console.error('Error cleaning stale images:', error);
    return { cleaned: 0, total: 0 };
  }
};

/**
 * DEBUG: Find news by title keyword and log full details
 * Call from browser console: import('/services/newsCache').then(m => m.debugFindNews('Sindoor'))
 */
export const debugFindNews = async (keyword: string): Promise<void> => {
  try {
    console.log(`\n🔍 Searching for news containing: "${keyword}"...\n`);

    const q = query(
      collection(db, NEWS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const querySnapshot = await getDocs(q);
    let found = 0;

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const title = data.title || '';

      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        found++;
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📰 FOUND: ${title}`);
        console.log(`📋 Doc ID: ${docSnapshot.id}`);
        console.log(`🖼️  Image URL: ${data.imageUrl || 'NO IMAGE'}`);
        console.log(`📂 Category: ${data.category || 'N/A'}`);
        console.log(`📅 Date: ${data.date || 'N/A'}`);
        console.log(`🔗 Source URL: ${data.sourceUrl || 'N/A'}`);

        // Check image URL issues
        if (!data.imageUrl) {
          console.log('⚠️  ISSUE: No image URL at all');
        } else if (isStaleImageUrl(data.imageUrl)) {
          console.log('⚠️  ISSUE: Image URL is STALE (known broken service)');
        } else if (data.imageUrl.startsWith('data:')) {
          console.log('⚠️  ISSUE: Image is base64 encoded (might be too large)');
        } else if (!data.imageUrl.startsWith('http')) {
          console.log('⚠️  ISSUE: Image URL does not start with http');
        }

        console.log('\n📦 Full data:', JSON.stringify(data, null, 2));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }
    });

    if (found === 0) {
      console.log(`❌ No news found containing "${keyword}"`);
      console.log(`   Total news items checked: ${querySnapshot.size}`);
    } else {
      console.log(`✅ Found ${found} news item(s) containing "${keyword}"`);
    }
  } catch (error) {
    console.error('Error searching news:', error);
  }
};

/**
 * DEBUG: List all news with their image status
 */
export const debugListAllNewsImages = async (): Promise<void> => {
  try {
    console.log('\n📰 Listing all news and their image status...\n');

    const q = query(
      collection(db, NEWS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const querySnapshot = await getDocs(q);
    const docs = querySnapshot.docs;

    docs.forEach((docSnapshot, index) => {
      const data = docSnapshot.data();
      const title = (data.title || 'No title').slice(0, 60);
      const imageUrl = data.imageUrl || '';

      let status = '✅';
      if (!imageUrl) {
        status = '❌ NO IMAGE';
      } else if (isStaleImageUrl(imageUrl)) {
        status = '⚠️  STALE';
      } else if (imageUrl.startsWith('data:')) {
        status = '📦 BASE64';
      }

      console.log(`${index + 1}. ${status} | ${title}...`);
      if (status !== '✅') {
        console.log(`   └─ URL: ${imageUrl.slice(0, 80)}...`);
      }
    });
  } catch (error) {
    console.error('Error listing news:', error);
  }
};
