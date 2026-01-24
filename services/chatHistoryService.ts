import {
  collection,
  query,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { ChatMessage, ChatHistoryRecord, LLMProvider } from '../types';

const CHAT_HISTORY_COLLECTION = 'chatHistory';
const MAX_HISTORY = 5;

/**
 * Load chat history for a user
 * Converts Firestore records into ChatMessage format for display
 * @param userId The user's UID
 * @returns Array of ChatMessages (user + assistant messages)
 */
export async function loadChatHistory(userId: string): Promise<ChatMessage[]> {
  try {
    const historyRef = collection(db, 'users', userId, CHAT_HISTORY_COLLECTION);
    const q = query(historyRef, orderBy('createdAt', 'asc'), limit(MAX_HISTORY));

    const snapshot = await getDocs(q);
    const messages: ChatMessage[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as ChatHistoryRecord;

      // Add user message
      messages.push({
        id: `${docSnap.id}-q`,
        role: 'user',
        content: data.question,
        timestamp: data.timestamp,
        provider: data.provider
      });

      // Add assistant message
      messages.push({
        id: `${docSnap.id}-a`,
        role: 'assistant',
        content: data.answer,
        timestamp: data.timestamp,
        provider: data.provider
      });
    });

    console.log(`[chatHistoryService] Loaded ${messages.length} messages for user ${userId}`);
    return messages;
  } catch (error) {
    console.error('[chatHistoryService] Error loading chat history:', error);
    return [];
  }
}

/**
 * Save a chat exchange (question + answer) to Firestore
 * @param userId The user's UID
 * @param question The user's question
 * @param answer The assistant's answer
 * @param provider The LLM provider used
 * @returns The total count of history records after saving
 */
export async function saveChatMessage(
  userId: string,
  question: string,
  answer: string,
  provider: LLMProvider
): Promise<number> {
  try {
    const historyRef = collection(db, 'users', userId, CHAT_HISTORY_COLLECTION);

    await addDoc(historyRef, {
      userId,
      question,
      answer,
      provider,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp()
    });

    console.log(`[chatHistoryService] Saved message for user ${userId} using ${provider}`);

    // Return current count
    const snapshot = await getDocs(query(historyRef));
    return snapshot.size;
  } catch (error) {
    console.error('[chatHistoryService] Error saving chat message:', error);
    throw error;
  }
}

/**
 * Delete the oldest chat history record for a user
 * Used to enforce MAX_HISTORY limit
 * @param userId The user's UID
 */
export async function clearOldestMessage(userId: string): Promise<void> {
  try {
    const historyRef = collection(db, 'users', userId, CHAT_HISTORY_COLLECTION);
    const q = query(historyRef, orderBy('createdAt', 'asc'), limit(1));

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const oldestDoc = snapshot.docs[0];
      await deleteDoc(doc(db, 'users', userId, CHAT_HISTORY_COLLECTION, oldestDoc.id));
      console.log(`[chatHistoryService] Deleted oldest message for user ${userId}`);
    }
  } catch (error) {
    console.error('[chatHistoryService] Error clearing oldest message:', error);
  }
}

/**
 * Clear all chat history for a user
 * @param userId The user's UID
 */
export async function clearAllChatHistory(userId: string): Promise<void> {
  try {
    const historyRef = collection(db, 'users', userId, CHAT_HISTORY_COLLECTION);
    const snapshot = await getDocs(query(historyRef));

    const deletePromises = snapshot.docs.map(docSnap =>
      deleteDoc(doc(db, 'users', userId, CHAT_HISTORY_COLLECTION, docSnap.id))
    );

    await Promise.all(deletePromises);
    console.log(`[chatHistoryService] Cleared all chat history for user ${userId}`);
  } catch (error) {
    console.error('[chatHistoryService] Error clearing all chat history:', error);
    throw error;
  }
}
