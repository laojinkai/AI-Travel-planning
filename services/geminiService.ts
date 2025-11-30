import { SYSTEM_INSTRUCTION, DOUBAO_API_KEY, DOUBAO_MODEL, DOUBAO_ENDPOINT } from "../constants";
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

// Doubao doesn't have a stateful "Chat" object like Gemini SDK, 
// so we return a dummy object or just nothing.
export const createChatSession = async (): Promise<any> => {
  return {};
};

// Generate a short title for the session
export const generateSessionTitle = async (userMessage: string, aiResponse: string): Promise<string> => {
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
    const response = await fetch(DOUBAO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL,
        messages: [
           { role: 'system', content: '你是标题生成助手。' },
           { role: 'user', content: prompt }
        ],
        stream: false
      })
    });

    if (response.ok) {
      const data = await response.json();
      const title = data.choices?.[0]?.message?.content?.trim();
      return title ? title.replace(/["《》]/g, '') : "新旅行计划";
    }
  } catch (e) {
    console.warn("Failed to generate title", e);
  }
  return "新旅行计划";
};

// Stream handling for Doubao (OpenAI-compatible SSE)
export async function* sendMessageStream(
  _dummyChat: any, // Unused, we pass full history instead
  userMessage: string,
  preferences?: UserPreferences,
  messageHistory: Message[] = []
) {
  const context = preferences ? formatPreferencesContext(preferences) : "";
  const finalUserMessage = `${userMessage}${context}`;

  // Construct messages array for the API
  const apiMessages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...messageHistory.map(m => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text
    })),
    { role: 'user', content: finalUserMessage }
  ];

  try {
    const response = await fetch(DOUBAO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL,
        messages: apiMessages,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
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
      
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") return;

        try {
          const json = JSON.parse(dataStr);
          const content = json.choices?.[0]?.delta?.content || "";
          if (content) {
            yield { text: content };
          }
        } catch (e) {
          console.warn("Failed to parse SSE JSON", e);
        }
      }
    }

  } catch (error) {
    console.error("Doubao API request failed:", error);
    yield { text: "\n\n(抱歉，连接 AI 服务时出现网络错误，请稍后重试。)" };
  }
}