import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from './firebase';
import { NewsEvent } from '../types';

export interface GlobeMarker {
  id: string;
  type: 'NEWS' | 'BREAKING' | 'CONFLICT' | 'USER_BIRTH' | 'USER_CURRENT' | 'SEARCH_RESULT';
  coordinates: { latitude: number; longitude: number };
  title: string;
  summary: string;
  metadata?: any;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  clickable: boolean;
  navigationTarget?: string;
  feedIndex?: number; // 在 Feed 列表中的索引位置
  // 聚合标记：同一位置的多条新闻
  clusteredMarkers?: GlobeMarker[];
}

/**
 * 为每个标记找到附近的标记（用于悬停时显示）
 * 不聚合成一个点，而是保留所有点，只是在悬停时一起显示
 * 距离阈值：约 300km（3 度）
 */
export function findNearbyMarkers(markers: GlobeMarker[], threshold: number = 3): GlobeMarker[] {
  if (markers.length === 0) return [];

  return markers.map((marker, i) => {
    // 查找当前标记附近的其他标记
    const nearby: GlobeMarker[] = [];

    for (let j = 0; j < markers.length; j++) {
      if (i === j) continue;

      const other = markers[j];
      const distance = Math.sqrt(
        Math.pow(marker.coordinates.latitude - other.coordinates.latitude, 2) +
        Math.pow(marker.coordinates.longitude - other.coordinates.longitude, 2)
      );

      if (distance < threshold) {
        nearby.push(other);
      }
    }

    if (nearby.length === 0) {
      // 没有附近的标记
      return marker;
    } else {
      // 有附近的标记，存储起来用于悬停显示
      // 把自己放在第一个，附近的按距离排序
      return {
        ...marker,
        clusteredMarkers: [marker, ...nearby],
      };
    }
  });
}

// 保留旧函数名以兼容，但改为使用新逻辑
export function clusterMarkers(markers: GlobeMarker[], threshold: number = 3): GlobeMarker[] {
  return findNearbyMarkers(markers, threshold);
}

/**
 * Fetches all globe markers for the authenticated user
 */
export async function fetchGlobeMarkers(): Promise<GlobeMarker[]> {
  const functions = getFunctions();
  const getMarkersFunc = httpsCallable(functions, 'getGlobeMarkers');

  try {
    const result = await getMarkersFunc();
    const data = result.data as { success: boolean; markers: GlobeMarker[] };

    if (data.success) {
      return data.markers;
    }

    throw new Error('Failed to fetch globe markers');
  } catch (error) {
    console.error('Error fetching globe markers:', error);
    return [];
  }
}

/**
 * Analyzes entity location for search results
 */
export async function analyzeEntityLocation(
  entityName: string,
  entityType?: string
): Promise<GlobeMarker | null> {
  const functions = getFunctions();
  const analyzeFunc = httpsCallable(functions, 'analyzeEntityLocation');

  try {
    const result = await analyzeFunc({ entityName, entityType });
    const response = result.data as { success: boolean; data: any };

    if (response.success && response.data) {
      return {
        id: `search-${Date.now()}`,
        type: 'SEARCH_RESULT',
        coordinates: response.data.coordinates,
        title: entityName,
        summary: response.data.entitySummary,
        metadata: {
          country: response.data.country,
          city: response.data.city,
          locationSummary: response.data.locationSummary,
        },
        clickable: true,
      };
    }

    return null;
  } catch (error) {
    console.error('Error analyzing entity location:', error);
    return null;
  }
}

/**
 * 根据 feedNews 获取对应的位置标记
 * 这样 Globe 和 Feed 显示的新闻就同步了
 */
export async function fetchMarkersForFeedNews(
  feedNews: NewsEvent[]
): Promise<GlobeMarker[]> {
  console.log('🌍 fetchMarkersForFeedNews called with', feedNews.length, 'news items');
  if (feedNews.length === 0) return [];

  const newsMarkers: GlobeMarker[] = [];

  try {
    // 获取所有 feedNews 的 titleHash（用于查询 news_locations）
    // 注意：news_locations 的文档 ID 是 titleHash，不是 news.id
    const titleHashToNews = new Map<string, { news: NewsEvent; index: number }>();
    feedNews.forEach((news, index) => {
      const hash = news.titleHash || news.id; // 优先使用 titleHash，fallback 到 id
      if (hash) {
        titleHashToNews.set(hash, { news, index });
      }
    });

    const newsHashes = Array.from(titleHashToNews.keys());
    console.log('🌍 Title hashes to query:', JSON.stringify(newsHashes));
    console.log('🌍 First news titleHash:', feedNews[0]?.titleHash, 'id:', feedNews[0]?.id);

    if (newsHashes.length === 0) return [];

    // Firestore 'in' 查询最多支持 30 个值，分批查询
    const batchSize = 30;
    const batches: string[][] = [];
    for (let i = 0; i < newsHashes.length; i += batchSize) {
      batches.push(newsHashes.slice(i, i + batchSize));
    }

    // 查询 news_locations collection
    for (const batch of batches) {
      console.log('🌍 Querying news_locations for batch of', batch.length, 'hashes');
      const locationsQuery = query(
        collection(db, 'news_locations'),
        where(documentId(), 'in', batch)
      );

      const snapshot = await getDocs(locationsQuery);
      console.log('🌍 Found', snapshot.size, 'matching locations in this batch');

      snapshot.forEach(doc => {
        const location = doc.data();
        console.log('🌍 Location doc:', doc.id, 'has coordinates:', !!location.coordinates, 'error:', location.error);
        if (location.error || !location.coordinates) return;

        // 通过 titleHash 找到对应的 feedNews 项
        const match = titleHashToNews.get(doc.id);
        if (match) {
          const { news: newsItem, index: newsIndex } = match;
          newsMarkers.push({
            id: newsItem.id, // 使用原始 news.id 用于导航
            type: 'NEWS',
            coordinates: location.coordinates,
            title: newsItem.title,
            summary: location.locationSummary || `${location.city || location.state || location.country}`,
            metadata: {
              newsId: newsItem.id,
              titleHash: doc.id,
              country: location.country,
              city: location.city,
            },
            clickable: true,
            navigationTarget: newsItem.id, // 用于导航到 Feed 中的新闻
            feedIndex: newsIndex, // 记录在 Feed 中的位置
          });
        }
      });
    }

    console.log('🌍 Total NEWS markers created:', newsMarkers.length);
    return newsMarkers;
  } catch (error) {
    console.error('Error fetching markers for feed news:', error);
    return [];
  }
}

/**
 * 获取非新闻类型的标记（用户位置、冲突区域、突发新闻）
 * 这些不依赖于 feedNews
 */
export async function fetchNonNewsMarkers(): Promise<GlobeMarker[]> {
  const functions = getFunctions();
  const getMarkersFunc = httpsCallable(functions, 'getGlobeMarkers');

  try {
    const result = await getMarkersFunc();
    const data = result.data as { success: boolean; markers: GlobeMarker[] };

    if (data.success) {
      // 只返回非 NEWS 类型的标记
      return data.markers.filter(m => m.type !== 'NEWS');
    }

    return [];
  } catch (error) {
    console.error('Error fetching non-news markers:', error);
    return [];
  }
}
