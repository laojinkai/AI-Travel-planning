import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message, UserPreferences } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const MODEL_NAME = 'gemini-2.5-flash';

// 格式化用户偏好
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
  
  return `\n\n[用户旅行偏好上下文]:\n${parts.join('\n')}\n(请参考此上下文生成行程，如果用户有新指令则优先满足新指令)`;
};

export const createChatSession = async (): Promise<any> => {
  return {};
};

// 生成短标题
export const generateSessionTitle = async (userMessage: string, aiResponse: string): Promise<string> => {
  if (!process.env.API_KEY) return "新旅行计划";

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
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    const title = response.text?.trim();
    return title ? title.replace(/["《》]/g, '') : "新旅行计划";
  } catch (e) {
    console.warn("Failed to generate title", e);
    return "新旅行计划";
  }
};

// 使用 Google GenAI SDK 实现流式对话
export async function* sendMessageStream(
  _dummyChat: any,
  userMessage: string,
  preferences?: UserPreferences,
  messageHistory: Message[] = []
) {
  if (!process.env.API_KEY) {
    yield { text: "⚠️ 错误：未检测到 API Key。请在环境变量中配置 API_KEY。" };
    return;
  }

  const context = preferences ? formatPreferencesContext(preferences) : "";
  let finalUserContent = userMessage;
  if (context) {
      finalUserContent += `\n${context}`;
  }
  
  // 历史记录转换
  const history = messageHistory.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  try {
    const chat = ai.chats.create({
      model: MODEL_NAME,
      history: history,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });

    const result = await chat.sendMessageStream({ message: finalUserContent });

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      const text = c.text;
      if (text) {
        yield { text };
      }
    }

  } catch (error) {
    console.error("Stream error:", error);
    yield { text: "\n\n(网络连接中断，请检查网络或 API Key 设置。)" };
  }
}