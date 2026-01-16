/**
 * Breaking News Service
 *
 * Monitors Firestore for new breaking news notifications
 * and displays browser push notifications when user has notifications enabled.
 */

import { collection, query, where, onSnapshot, Timestamp, updateDoc, doc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { sendLocalNotification } from './notificationService';

interface BreakingNewsNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  sources?: string;
  timestamp: string;
  read: boolean;
}

let unsubscribe: (() => void) | null = null;

/**
 * Start listening for breaking news notifications
 * Only call this when user has notifications enabled!
 */
export function startBreakingNewsListener(userId: string): void {
  // Clean up existing listener
  if (unsubscribe) {
    unsubscribe();
  }

  console.log('🔔 Starting breaking news listener for user:', userId);

  // Listen for unread breaking news notifications from the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const q = query(
    collection(db, 'breaking_news_notifications'),
    where('read', '==', false),
    where('timestamp', '>', oneDayAgo.toISOString())
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data() as BreakingNewsNotification;
        const notificationId = change.doc.id;

        console.log('⚡ New breaking news detected:', data.title);

        // Show browser notification
        const shown = sendLocalNotification(
          `⚡ ${data.category}: ${data.title}`,
          data.body,
          {
            tag: `breaking-news-${notificationId}`,
            requireInteraction: true // Keep notification visible
            // Remove icon/badge to avoid 404 errors
          }
        );

        if (shown) {
          console.log('✅ Browser notification shown');

          // Mark as read after showing
          setTimeout(() => {
            updateDoc(doc(db, 'breaking_news_notifications', notificationId), {
              read: true
            }).catch(err => console.error('Failed to mark as read:', err));
          }, 1000);
        }
      }
    });
  }, (error) => {
    console.error('Breaking news listener error:', error);
  });
}

/**
 * Stop listening for breaking news notifications
 */
export function stopBreakingNewsListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    console.log('🔕 Breaking news listener stopped');
  }
}

/**
 * Get unread breaking news count
 */
export async function getUnreadBreakingNewsCount(): Promise<number> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const q = query(
      collection(db, 'breaking_news_notifications'),
      where('read', '==', false),
      where('timestamp', '>', oneDayAgo.toISOString())
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
}
