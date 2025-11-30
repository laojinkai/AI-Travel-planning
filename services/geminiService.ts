import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";
import { Message, UserPreferences } from "../types";

// Helper to format preferences into a prompt context string
export const formatPreferencesContext = (prefs: UserPreferences): string => {
  const parts = [];
  if (prefs.destination) parts.push(`目的地: ${prefs.destination}`);
  if (prefs.origin) parts.push(`出发地: ${prefs.origin}`);
  if (prefs.startDate) parts.push(`出发日期: ${prefs.startDate}`);
  if (prefs.duration) parts.push(`行程天数: ${prefs.duration} 天`);
  if (prefs.travelers) parts.push(`出行人数: ${prefs.travelers} 人`);
  if (prefs.budget) parts.push(`预算等级: ${prefs.budget}`);
  if (prefs.interests.length > 0) parts.push(`兴趣爱好: ${prefs.interests.join(', ')}`);
  if (prefs.additionalInfo) parts.push(`额外备注: ${prefs.additionalInfo}`);
  
  if (parts.length === 0) return "";
  
  return `\n\n[用户旅行偏好上下文]:\n${parts.join('\n')}\n(如果相关，请使用此上下文来指导您的回复，但优先考虑用户最新的消息。)`;
};

// Return a dummy object since we handle state manually in App.tsx
export const createChatSession = async (): Promise<any> => {
  return {};
};

// Generate a short title for the session
export const generateSessionTitle = async (userMessage: string, aiResponse: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    请根据以下关于旅游规划的对话内容，生成一个非常简短的标题（10个汉字以内）。
    
    用户说：${userMessage.substring(0, 200)}
    AI 回复：${aiResponse.substring(0, 200)}
    
    要求：
    1. 必须是中文。
    2. 不要包含标点符号。
    3. 格式例如：“成都三天美食游”、“北京故宫文化旅”。
    4. 只返回标题文本，不要任何解释。
  `;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: "你是一个善于总结的助手。",
        }
    });
    
    const title = response.text?.trim();
    return title ? title.replace(/["《》]/g, '') : "新旅行计划";
  } catch (e) {
    console.warn("Failed to generate title", e);
    return "新旅行计划";
  }
};

// Stream handling for Gemini
export async function* sendMessageStream(
  _dummyChat: any,
  userMessage: string,
  preferences?: UserPreferences,
  messageHistory: Message[] = []
) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const context = preferences ? formatPreferencesContext(preferences) : "";

  // Construct contents for Gemini
  const contents = messageHistory.map((m, index) => {
      let text = m.text;
      // Append context to the very last user message for relevance
      if (index === messageHistory.length - 1 && m.role === 'user') {
          text += context;
      }
      return {
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: text }]
      };
  });

  try {
    const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
        }
    });

    for await (const chunk of responseStream) {
        const c = chunk as GenerateContentResponse;
        if (c.text) {
            yield { text: c.text };
        }
    }

  } catch (error) {
    console.error("Gemini API request failed:", error);
    yield { text: "\n\n(抱歉，连接 AI 服务时出现网络错误，请检查 API Key 是否配置正确，或者稍后重试。)" };
  }
}