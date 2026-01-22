import { getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import app from './firebase';

// 整合后的中文新闻播报数据接口
export interface ChinaNewsBroadcastData {
  metadata: {
    source_doc_id: string;
    source_collection: string;
    version: string;
    created_at: any;
    source_project: string;
    timezone: string;
  };
  time: {
    beijing_time: string;
    crawl_date: string;
    crawl_time: string;
    generated_at: any;
  };
  statistics: {
    platforms: {
      total: number;
      success: number;
      failed: number;
    };
    rss: {
      total: number;
      new: number;
      matched: number;
      filtered: number;
    };
    hotlist: {
      total: number;
      new: number;
      matched: number;
    };
    combined: {
      total: number;
      new: number;
      matched: number;
    };
  };
  broadcast: string;  // 整合后的播报稿文本
  broadcast_length: number;
  language: string;
  processing: {
    translated_rss: number;
    extracted_news: number;
    has_ai_analysis: boolean;
  };
}

/**
 * 获取最新的中文新闻播报
 * 从 news_stanseradar_china_consolidated collection 读取
 */
export async function getLatestChinaNewsBroadcast(): Promise<ChinaNewsBroadcastData | null> {
  try {
    const db = getFirestore(app);

    console.log('[chinaNewsService] Querying news_stanseradar_china_consolidated...');

    // 查询最新的整合文档
    const q = query(
      collection(db, 'news_stanseradar_china_consolidated'),
      orderBy('__name__', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(q);

    console.log('[chinaNewsService] Query result:', snapshot.empty ? 'Empty' : `Found ${snapshot.size} docs`);

    if (!snapshot.empty) {
      const docData = snapshot.docs[0].data();
      console.log('✅ Loaded China news broadcast:', snapshot.docs[0].id);
      console.log('[chinaNewsService] Document data keys:', Object.keys(docData));
      console.log('[chinaNewsService] Has broadcast:', !!docData.broadcast);
      console.log('[chinaNewsService] Broadcast length:', docData.broadcast?.length);

      return docData as ChinaNewsBroadcastData;
    }

    console.warn('[chinaNewsService] No China news broadcast found in collection');
    return null;
  } catch (error) {
    console.error('[chinaNewsService] Failed to load China news broadcast:', error);
    return null;
  }
}

/**
 * 监听最新中文新闻播报的实时更新
 * @param callback 当数据更新时调用
 * @returns 取消监听的函数
 */
export function subscribeToLatestChinaNewsBroadcast(
  callback: (data: ChinaNewsBroadcastData | null) => void
): () => void {
  const db = getFirestore(app);

  // 直接查询最新文档并监听
  let unsubscribeFunc: (() => void) | null = null;

  // 先获取最新文档ID
  getLatestChinaNewsBroadcast().then((latestData) => {
    if (latestData && latestData.metadata?.source_doc_id) {
      const docId = latestData.metadata.source_doc_id;

      // 监听这个文档
      unsubscribeFunc = onSnapshot(
        doc(db, 'news_stanseradar_china_consolidated', docId),
        (snapshot) => {
          if (snapshot.exists()) {
            console.log('🔄 China news broadcast updated:', snapshot.id);
            callback(snapshot.data() as ChinaNewsBroadcastData);
          } else {
            callback(null);
          }
        },
        (error) => {
          console.error('Failed to subscribe to China news broadcast:', error);
          callback(null);
        }
      );
    }
  });

  return () => {
    if (unsubscribeFunc) {
      unsubscribeFunc();
    }
  };
}

/**
 * 获取指定文档ID的中文新闻播报
 * @param docId 文档ID，格式：YYYY-MM-DD_HH-MM
 */
export async function getChinaNewsBroadcastByDocId(docId: string): Promise<ChinaNewsBroadcastData | null> {
  try {
    const db = getFirestore(app);
    const docRef = doc(db, 'news_stanseradar_china_consolidated', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as ChinaNewsBroadcastData;
    }

    return null;
  } catch (error) {
    console.error(`Failed to load China news broadcast for ${docId}:`, error);
    return null;
  }
}
