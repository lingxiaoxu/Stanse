/**
 * Breaking News Notifier
 *
 * This Cloud Function runs every hour to check for breaking/headline news
 * and sends email notifications to users who have notifications enabled.
 *
 * Schedule: Every hour (0 * * * *)
 */

import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  importance: 'breaking' | 'headline' | 'normal';
  category?: string;
}

/**
 * Check if this is breaking/headline news worthy of notification
 */
function isBreakingNews(article: any): boolean {
  const title = article.title?.toLowerCase() || '';
  const description = article.description?.toLowerCase() || '';

  // Breaking news keywords
  const breakingKeywords = [
    'breaking', 'urgent', 'alert', 'just in', 'developing',
    'major', 'crisis', 'emergency', 'critical', 'unprecedented'
  ];

  // Headline importance indicators
  const headlineKeywords = [
    'president', 'senate', 'congress', 'supreme court',
    'war', 'conflict', 'military', 'attack',
    'market crash', 'economy', 'recession',
    'election', 'vote', 'ballot'
  ];

  const text = title + ' ' + description;

  // Check for breaking keywords
  const hasBreaking = breakingKeywords.some(keyword => text.includes(keyword));

  // Check for headline keywords
  const hasHeadline = headlineKeywords.some(keyword => text.includes(keyword));

  return hasBreaking || hasHeadline;
}

/**
 * Fetch latest news from your existing news API
 */
async function fetchLatestNews(): Promise<NewsArticle[]> {
  try {
    // Get news from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Query your news_cache collection for recent news
    const newsSnapshot = await db.collection('news_cache')
      .where('fetchedAt', '>', oneHourAgo.toISOString())
      .orderBy('fetchedAt', 'desc')
      .limit(50)
      .get();

    if (newsSnapshot.empty) {
      console.log('No new articles found in the last hour');
      return [];
    }

    const articles: NewsArticle[] = [];

    newsSnapshot.forEach(doc => {
      const data = doc.data();
      const article = {
        title: data.title || '',
        summary: data.description || data.summary || '',
        source: data.source || 'Unknown',
        url: data.url || '',
        publishedAt: data.publishedAt || data.fetchedAt,
        importance: isBreakingNews(data) ? 'breaking' as const : 'normal' as const,
        category: data.category
      };

      if (article.importance === 'breaking') {
        articles.push(article);
      }
    });

    return articles;
  } catch (error) {
    console.error('Error fetching news:', error);
    return [];
  }
}

/**
 * Get users who should receive notifications
 * Only checks if user has notifications ON (granted status)
 */
async function getNotifiableUsers(): Promise<Array<{userId: string, email: string, lastNotified?: string}>> {
  try {
    // Get all users from userNotifications collection who have granted permission
    const notificationsSnapshot = await db.collection('userNotifications')
      .where('status', '==', 'granted')
      .get();

    const users: Array<{userId: string, email: string, lastNotified?: string}> = [];

    for (const doc of notificationsSnapshot.docs) {
      const notifData = doc.data();
      const userId = notifData.userId;

      if (!userId) continue;

      // Check if enough time has passed since last notification (default: 1 hour)
      const lastSent = notifData.lastBreakingNewsNotification;
      if (lastSent) {
        const lastSentTime = new Date(lastSent);
        const now = new Date();
        const hoursSinceLastNotification = (now.getTime() - lastSentTime.getTime()) / (1000 * 60 * 60);

        // Skip if notified in the last hour (prevents spam)
        if (hoursSinceLastNotification < 1) {
          console.log(`⏭️  Skipping ${userId}: Notified ${hoursSinceLastNotification.toFixed(2)}h ago`);
          continue;
        }
      }

      // Get user email
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          users.push({
            userId,
            email: userData?.email || '',
            lastNotified: lastSent
          });
        }
      } catch (error) {
        console.error(`Failed to get user ${userId}:`, error);
      }
    }

    return users;
  } catch (error) {
    console.error('Error getting notifiable users:', error);
    return [];
  }
}

/**
 * Send email notification using SendGrid
 */
async function sendEmailNotification(
  email: string,
  articles: NewsArticle[]
): Promise<boolean> {
  try {
    const sgMail = require('@sendgrid/mail');

    // Get API key from environment (set via firebase functions:config:set)
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      console.error('SENDGRID_API_KEY not configured');
      return false;
    }

    sgMail.setApiKey(apiKey);

    const topArticles = articles.slice(0, 3); // Send top 3 breaking news

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #000; border-bottom: 3px solid #000; padding-bottom: 10px;">
          ⚡ Breaking News Alert
        </h2>
        <p style="color: #666; font-size: 14px;">
          You're receiving this because important news just broke:
        </p>
        ${topArticles.map(article => `
          <div style="margin: 20px 0; padding: 15px; border: 2px solid #000; background: #f9f9f9;">
            <h3 style="margin: 0 0 10px 0; color: #000;">
              ${article.title}
            </h3>
            <p style="color: #333; font-size: 14px; line-height: 1.6;">
              ${article.summary}
            </p>
            <div style="margin-top: 10px;">
              <span style="color: #666; font-size: 12px;">📰 ${article.source}</span>
              ${article.url ? `<a href="${article.url}" style="margin-left: 15px; color: #0066cc; text-decoration: none;">Read more →</a>` : ''}
            </div>
          </div>
        `).join('')}
        <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
          You can manage your notification preferences in your Stanse app settings.
        </p>
      </div>
    `;

    const msg = {
      to: email,
      from: 'lxu912@gmail.com', // Must match your verified sender
      subject: `⚡ Breaking News Alert - ${topArticles[0]?.title.slice(0, 50)}...`,
      html: htmlContent
    };

    await sgMail.send(msg);
    console.log(`📧 Sent breaking news email to ${email}`);
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${email}:`, error);
    return false;
  }
}

/**
 * Update last notification timestamp for user
 */
async function updateLastNotificationTime(userId: string): Promise<void> {
  try {
    // Update notification document for this user (userId as document ID in userNotifications collection)
    const notifRef = db.collection('userNotifications').doc(userId);
    await notifRef.set({
      lastBreakingNewsNotification: new Date().toISOString()
    }, { merge: true });
    console.log(`✅ Updated last notification time for user ${userId}`);
  } catch (error) {
    console.error(`❌ Failed to update notification time for ${userId}:`, error);
  }
}

/**
 * Main function - runs every hour
 */
export const checkBreakingNews = functions.scheduler.onSchedule(
  {
    schedule: '0 * * * *', // Every hour at minute 0
    timeZone: 'UTC',
    region: 'us-central1'
  },
  async () => {
    console.log('🔔 Starting breaking news check...');

    try {
      // 1. Fetch latest news
      const breakingArticles = await fetchLatestNews();

      if (breakingArticles.length === 0) {
        console.log('✅ No breaking news found');
        return;
      }

      console.log(`📰 Found ${breakingArticles.length} breaking news articles`);

      // 2. Get users who want notifications
      const users = await getNotifiableUsers();

      if (users.length === 0) {
        console.log('👥 No users to notify');
        return;
      }

      console.log(`👥 Found ${users.length} users to notify`);

      // 3. Send notifications
      let successCount = 0;
      let failCount = 0;

      for (const user of users) {
        const sent = await sendEmailNotification(user.email, breakingArticles);

        if (sent) {
          await updateLastNotificationTime(user.userId);
          successCount++;
        } else {
          failCount++;
        }

        // Rate limit: wait 100ms between emails to avoid hitting API limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ Sent ${successCount} notifications, ${failCount} failed`);

      // 4. Log the event
      await db.collection('notification_logs').add({
        timestamp: new Date().toISOString(),
        type: 'BREAKING_NEWS',
        articlesCount: breakingArticles.length,
        usersNotified: successCount,
        failed: failCount,
        topArticles: breakingArticles.slice(0, 3).map(a => ({
          title: a.title,
          source: a.source
        }))
      });

    } catch (error: any) {
      console.error('❌ Error in breaking news check:', error);
    }
  }
);
