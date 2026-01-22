import { GoogleGenAI } from "@google/genai";

// Get base URL for API proxy in production (same as geminiService)
const getBaseUrl = () => {
  if (typeof window === 'undefined') return undefined;
  if (window.location.hostname === 'localhost') return undefined;
  return `${window.location.origin}/api/gemini`;
};

// Initialize Gemini Client (same pattern as geminiService.ts)
const baseUrl = getBaseUrl();
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: baseUrl ? { baseUrl } : undefined
});

/**
 * 检测文本是否为英文
 * @param text 要检测的文本
 * @returns 如果英文字符占比超过50%则返回true
 */
export function isEnglish(text: string): boolean {
  if (!text || text.length === 0) return false;

  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.length;

  return englishChars / totalChars > 0.5;
}

/**
 * 使用 Gemini 将英文文本翻译成简洁的中文
 * @param text 英文文本
 * @returns 中文翻译
 */
export async function translateToChineseWithGemini(text: string): Promise<string> {
  // 如果已经是中文，直接返回
  if (!isEnglish(text)) {
    return text;
  }

  try {
    const prompt = `Translate this English news headline into concise, natural Chinese. Output ONLY the Chinese translation, no explanations:\n\n${text}`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 100
      }
    });

    const translation = result.text?.trim() || text;
    return translation;
  } catch (error) {
    console.error('Translation failed:', error);
    // 失败时返回原文
    return text;
  }
}

/**
 * 批量翻译多个文本
 * @param texts 要翻译的文本数组
 * @returns 翻译后的文本数组
 */
export async function batchTranslate(texts: string[]): Promise<string[]> {
  // 过滤掉空文本
  const validTexts = texts.filter(t => t && t.trim().length > 0);

  if (validTexts.length === 0) {
    return [];
  }

  // 并发翻译（但限制并发数以避免 rate limit）
  const results: string[] = [];
  const batchSize = 3; // 每批3个

  for (let i = 0; i < validTexts.length; i += batchSize) {
    const batch = validTexts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(text => translateToChineseWithGemini(text))
    );
    results.push(...batchResults);

    // 批次之间稍微延迟
    if (i + batchSize < validTexts.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * 翻译 RSS 新闻标题
 * @param rssItems RSS 项目列表
 * @returns 翻译后的标题列表
 */
export async function translateRSSHeadlines(
  rssItems: Array<{ title: string; [key: string]: any }>
): Promise<string[]> {
  const titles = rssItems.map(item => item.title).filter(Boolean);

  if (titles.length === 0) {
    return [];
  }

  // 检查哪些需要翻译
  const translationPromises = titles.map(async (title) => {
    if (isEnglish(title)) {
      return await translateToChineseWithGemini(title);
    }
    return title;
  });

  return await Promise.all(translationPromises);
}
