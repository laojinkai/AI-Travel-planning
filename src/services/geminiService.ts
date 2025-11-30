
import { Message, UserPreferences } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// 使用 Vite 标准环境变量 (解决白屏问题)
const API_KEY = (import.meta as any).env.VITE_DOUBAO_API_KEY;
// 豆包 API配置
const API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const MODEL_NAME = "doubao-seed-1-6-flash-250828"; // 您提供的豆包模型 ID

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
  if (!API_KEY) return "新旅行计划";

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
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: MODEL_NAME,
            messages: [{ role: 'user', content: prompt }],
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

// 使用 Fetch 实现豆包 API 流式对话
export async function* sendMessageStream(
  _dummyChat: any,
  userMessage: string,
  preferences?: UserPreferences,
  messageHistory: Message[] = []
) {
  if (!API_KEY) {
    yield { text: "⚠️ 错误：未检测到 API Key。请在 Vercel 环境变量中配置 VITE_DOUBAO_API_KEY。" };
    return;
  }

  const context = preferences ? formatPreferencesContext(preferences) : "";
  let finalUserContent = userMessage;
  if (context) {
      finalUserContent += `\n${context}`;
  }
  
  // 构造豆包/OpenAI 格式的消息历史
  const messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      ...messageHistory.map(m => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.text
      })),
      { role: 'user', content: finalUserContent }
  ];

  try {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: MODEL_NAME,
            messages: messages,
            stream: true // 开启流式传输
        })
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("Doubao API Error:", err);
        throw new Error(`API Error: ${response.status}`);
    }

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // 保留未完成的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") continue;

        try {
            const json = JSON.parse(dataStr);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
                yield { text: content };
            }
        } catch (e) {
            console.warn("Parse error", e);
        }
      }
    }

  } catch (error) {
    console.error("Stream error:", error);
    yield { text: "\n\n(网络连接中断或 API 额度不足，请检查 Vercel 环境变量设置。)" };
  }
}
