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
  Timestamp
} from 'firebase/firestore';
import { NewsEvent } from '../types';

const NEWS_COLLECTION = 'news';
const NEWS_IMAGES_COLLECTION = 'news_images';

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
 */
export const getImageFromCache = async (titleHash: string): Promise<string | null> => {
  try {
    const docRef = doc(db, NEWS_IMAGES_COLLECTION, titleHash);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data().imageUrl as string;
    }
    return null;
  } catch (error) {
    console.error('Error getting image from cache:', error);
    return null;
  }
};

/**
 * Save image to cache
 */
export const saveImageToCache = async (titleHash: string, imageUrl: string): Promise<void> => {
  try {
    const docRef = doc(db, NEWS_IMAGES_COLLECTION, titleHash);

    await setDoc(docRef, {
      titleHash,
      imageUrl,
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
