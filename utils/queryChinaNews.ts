import { getFirestore, doc, getDoc, collection, getDocs, query, limit, orderBy } from 'firebase/firestore';
import app from '../services/firebase';

/**
 * Query a specific document from news_stanseradar_china collection
 * Usage in browser console: queryChinaNewsDocument('2026-01-22_07-01')
 */
export async function queryChinaNewsDocument(docId: string) {
  try {
    const db = getFirestore(app);
    const docRef = doc(db, 'news_stanseradar_china', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('=== Document ID:', docId, '===\n');
      console.log('Raw data:', data);

      // Analyze structure
      console.log('\n=== Data Structure Analysis ===');
      console.log('Top-level fields:', Object.keys(data));

      // Check for hotlist_news structure
      if (data.hotlist_news && data.hotlist_news.keyword_groups) {
        const keywordGroups = data.hotlist_news.keyword_groups;
        console.log('\nKeyword Groups:', keywordGroups.length);

        let totalNews = 0;
        keywordGroups.forEach((group: any, idx: number) => {
          const newsCount = group.news_items?.length || 0;
          totalNews += newsCount;
          console.log(`  Group [${idx}]: ${newsCount} news items (keyword: ${group.keyword || '综合热榜'})`);
        });

        console.log('\nTotal news items:', totalNews);

        if (keywordGroups.length > 0 && keywordGroups[0].news_items?.length > 0) {
          console.log('\n=== Sample News Item (first one) ===');
          console.log(JSON.stringify(keywordGroups[0].news_items[0], null, 2));
          console.log('\nNews item fields:', Object.keys(keywordGroups[0].news_items[0]));
        }
      }

      // Display metadata and time info
      if (data.metadata) {
        console.log('\n=== Metadata ===');
        console.log('Version:', data.metadata.version);
        console.log('Mode:', data.metadata.mode);
        console.log('Timezone:', data.metadata.timezone);
      }

      if (data.time) {
        console.log('\n=== Time Info ===');
        console.log('Beijing Time:', data.time.beijing_time);
        console.log('Crawl Date:', data.time.crawl_date);
        console.log('Crawl Time:', data.time.crawl_time);
      }

      return data;
    } else {
      console.log('Document does not exist');
      return null;
    }
  } catch (error) {
    console.error('Error querying document:', error);
    throw error;
  }
}

/**
 * List all document IDs in news_stanseradar_china collection
 * Usage in browser console: listChinaNewsDocuments()
 */
export async function listChinaNewsDocuments(maxDocs: number = 10) {
  try {
    const db = getFirestore(app);
    const collectionRef = collection(db, 'news_stanseradar_china');
    const q = query(collectionRef, orderBy('__name__'), limit(maxDocs));
    const querySnapshot = await getDocs(q);

    console.log(`=== Found ${querySnapshot.size} documents (showing max ${maxDocs}) ===`);
    const docIds: string[] = [];
    querySnapshot.forEach((doc) => {
      console.log('- Document ID:', doc.id);
      docIds.push(doc.id);
    });

    return docIds;
  } catch (error) {
    console.error('Error listing documents:', error);
    throw error;
  }
}

/**
 * Get detailed statistics about the collection
 * Usage in browser console: analyzeChinaNewsCollection()
 */
export async function analyzeChinaNewsCollection() {
  try {
    const db = getFirestore(app);
    const collectionRef = collection(db, 'news_stanseradar_china');
    const querySnapshot = await getDocs(collectionRef);

    console.log('=== Collection Statistics ===');
    console.log('Total documents:', querySnapshot.size);

    let totalNewsItems = 0;
    let totalKeywordGroups = 0;
    const docSamples: any[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      let newsCount = 0;
      let groupCount = 0;

      if (data.hotlist_news && data.hotlist_news.keyword_groups) {
        const groups = data.hotlist_news.keyword_groups;
        groupCount = groups.length;
        totalKeywordGroups += groupCount;

        groups.forEach((group: any) => {
          const itemCount = group.news_items?.length || 0;
          newsCount += itemCount;
          totalNewsItems += itemCount;
        });
      }

      // Save first 3 documents as samples
      if (docSamples.length < 3) {
        docSamples.push({
          id: doc.id,
          data: data,
          newsCount: newsCount,
          groupCount: groupCount,
          beijingTime: data.time?.beijing_time || 'N/A'
        });
      }
    });

    console.log('Total keyword groups across all documents:', totalKeywordGroups);
    console.log('Total news items across all documents:', totalNewsItems);
    console.log('\n=== Sample Documents ===');
    docSamples.forEach((sample, idx) => {
      console.log(`\nSample ${idx + 1}: ${sample.id}`);
      console.log('Beijing Time:', sample.beijingTime);
      console.log('Keyword Groups:', sample.groupCount);
      console.log('News Items:', sample.newsCount);
      console.log('Top-level fields:', Object.keys(sample.data));
    });

    return {
      totalDocuments: querySnapshot.size,
      totalKeywordGroups,
      totalNewsItems,
      samples: docSamples
    };
  } catch (error) {
    console.error('Error analyzing collection:', error);
    throw error;
  }
}

// Make functions available globally in browser console
if (typeof window !== 'undefined') {
  (window as any).queryChinaNewsDocument = queryChinaNewsDocument;
  (window as any).listChinaNewsDocuments = listChinaNewsDocuments;
  (window as any).analyzeChinaNewsCollection = analyzeChinaNewsCollection;
}
