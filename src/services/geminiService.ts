import { Message, UserPreferences } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// Doubao API Configuration
const API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
// User provided model ID or default to a common one. 
// Using the one from user's curl example: doubao-seed-1-6-flash-250828
const MODEL_ID = "doubao-seed-1-6-flash-250828"; 

const getApiKey = () => {
  // Priority: Vite Env Var -> Process Env (fallback)
  return import.meta.env.VITE_DOUBAO_API_KEY || process.env.VITE_DOUBAO_API_KEY || '';
};

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

export const generateSessionTitle = async (userMessage: string, aiResponse: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "新旅行计划";

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
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: "user", content: prompt }
        ],
        stream: false
      })
    });

    const data = await response.json();
    const title = data.choices?.[0]?.message?.content?.trim();
    return title ? title.replace(/["《》]/g, '') : "新旅行计划";
  } catch (e) {
    console.warn("Failed to generate title", e);
    return "新旅行计划";
  }
};

export async function* sendMessageStream(
  _dummyChat: any,
  userMessage: string,
  preferences?: UserPreferences,
  messageHistory: Message[] = []
) {
  const apiKey = getApiKey();

  if (!apiKey) {
    yield { text: "⚠️ 错误：未检测到 API Key。请在 Vercel 环境变量中配置 VITE_DOUBAO_API_KEY。" };
    return;
  }

  const context = preferences ? formatPreferencesContext(preferences) : "";
  let finalUserContent = userMessage;
  if (context) {
      finalUserContent += `\n${context}`;
  }
  
  // Convert history to OpenAI format
  const historyMessages = messageHistory.map(m => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: m.text
  }));

  const messages = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    ...historyMessages,
    { role: "user", content: finalUserContent }
  ];

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: messages,
        stream: true,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error:", errorText);
      yield { text: `API 请求失败: ${response.status} ${response.statusText}` };
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");

    if (!reader) {
      yield { text: "无法读取响应流" };
      return;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(line => line.trim() !== "");

      for (const line of lines) {
        if (line.trim() === "data: [DONE]") return;
        
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6);
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield { text: content };
            }
          } catch (e) {
            console.debug("Error parsing SSE chunk", e);
          }
        }
      }
    }

  } catch (error) {
    console.error("Stream error:", error);
    yield { text: "\n\n(网络连接中断，请检查网络或 API Key 设置。)" };
  }
}