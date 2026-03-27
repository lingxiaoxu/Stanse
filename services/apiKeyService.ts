import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from './firebase';

export interface ApiKeyInfo {
  keyHash: string;
  keyPrefix: string;
  keySuffix: string;
  keyPreview: string;
  isActive: boolean;
  createdAt: any;
  lastUsedAt: any;
  lastUsedFromSkill: string | null;
  plan: 'free' | 'premium';
  generationCount: number;
}

/**
 * 从 Firestore 读取当前用户的 API Key 元信息（不含明文）
 */
export async function getApiKeyInfo(userId: string): Promise<ApiKeyInfo | null> {
  const keyDocRef = doc(db, 'authentication_api_keys', userId);
  const snap = await getDoc(keyDocRef);
  if (!snap.exists()) return null;
  return snap.data() as ApiKeyInfo;
}

/**
 * 调用 Cloud Function 生成（或重新生成）API Key
 * 返回明文 key（只此一次）
 */
export async function generateApiKey(): Promise<string> {
  const fn = httpsCallable<unknown, { key: string }>(functions, 'generateApiKey');
  const result = await fn({});
  return result.data.key;
}
