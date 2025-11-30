import React, { useState, useEffect, useRef } from 'react';
import { ChatSession, Message, UserPreferences, MapData } from './types';
import { INITIAL_PREFERENCES } from './constants';
import { createChatSession, sendMessageStream, generateSessionTitle } from './services/geminiService';
import { extractMapData, enrichMapDataWithGeocoding } from './utils/mapHelpers';
import { ChatMessage } from './components/ChatMessage';
import { SettingsModal } from './components/SettingsModal';
import { MapContainer } from './components/MapContainer';
import { Button } from './components/Button';

function App() {
  // --- 1. Synchronous Initialization from LocalStorage ---
  // This ensures data is ready immediately on first render, preventing "flash of empty" and data loss.

  const [sessionsHistory, setSessionsHistory] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('travel_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load history", e);
      return [];
    }
  });

  const [session, setSession] = useState<ChatSession>(() => {
    try {
      const lastId = localStorage.getItem('last_active_session_id');
      const savedHistoryStr = localStorage.getItem('travel_chat_history');
      const history = savedHistoryStr ? JSON.parse(savedHistoryStr) : [];
      
      // Attempt to restore the last active session
      if (lastId) {
        const found = history.find((s: ChatSession) => s.id === lastId);
        if (found) return found;
      }
      
      // If no valid history, or last session not found, create a fresh default one
      // But we DO NOT add it to history yet unless user interacts or explicitly creates it
      if (history.length > 0) {
          return history[0];
      }
      
      return {
        id: Date.now().toString(),
        name: '新行程',
        messages: [{
            id: 'welcome',
            role: 'model',
            text: "您好！我是您的 AI 智能旅游规划师（基于豆包大模型）。请告诉我您想去哪里，或者点击右上角的设置按钮先完善您的偏好。",
            timestamp: Date.now()
        }],
        updatedAt: Date.now()
      };
    } catch (e) {
      return {
        id: Date.now().toString(),
        name: '新行程',
        messages: [{
            id: 'welcome',
            role: 'model',
            text: "您好！我是您的 AI 智能旅游规划师（基于豆包大模型）。请告诉我您想去哪里。",
            timestamp: Date.now()
        }],
        updatedAt: Date.now()
      };
    }
  });

  const [preferences, setPreferences] = useState<UserPreferences>(() => {
      try {
          const saved = localStorage.getItem('travel_preferences');
          return saved ? JSON.parse(saved) : INITIAL_PREFERENCES;
      } catch {
          return INITIAL_PREFERENCES;
      }
  });

  // UI States
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [currentMapData, setCurrentMapData] = useState<MapData | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  
  // Title Editing State
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // --- 2. Persistence Effects ---

  // Save history whenever it changes
  useEffect(() => {
    localStorage.setItem('travel_chat_history', JSON.stringify(sessionsHistory));
  }, [sessionsHistory]);
  
  // Save preferences
  useEffect(() => {
    localStorage.setItem('travel_preferences', JSON.stringify(preferences));
  }, [preferences]);

  // Save active session ID to restore focus on reload
  useEffect(() => {
    localStorage.setItem('last_active_session_id', session.id);
  }, [session.id]);

  // Ensure current session is always in history (initial sync)
  useEffect(() => {
      // Check if current session exists in history
      const exists = sessionsHistory.find(s => s.id === session.id);
      if (!exists && sessionsHistory.length === 0) {
          if (session.messages.length > 0) {
              setSessionsHistory([session]);
          }
      }
  }, []); // Run once on mount

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, isLoading]);

  // Restore map view if session has map data
  useEffect(() => {
      const lastMapMsg = [...session.messages].reverse().find(m => m.mapData);
      if (lastMapMsg?.mapData) {
          setCurrentMapData(lastMapMsg.mapData);
          // Only auto-open map on large screens to avoid disrupting mobile view
          if (window.innerWidth > 768 && !isMapOpen) {
              setIsMapOpen(true);
          }
      } else {
          setCurrentMapData(null);
      }
  }, [session.id]); // Only when switching sessions

  // --- 3. Core Logic Helpers ---

  // Unified function to update local session AND history list simultaneously
  const updateSessionAndHistory = (newSession: ChatSession) => {
      setSession(newSession);
      setSessionsHistory(prev => {
          const exists = prev.find(s => s.id === newSession.id);
          if (exists) {
              return prev.map(s => s.id === newSession.id ? newSession : s);
          } else {
              // Add to top if new
              return [newSession, ...prev];
          }
      });
  };

  const createNewSession = () => {
    const welcomeMsg: Message = {
        id: 'welcome',
        role: 'model',
        text: "您好！我是您的 AI 智能旅游规划师。请告诉我您想去哪里。",
        timestamp: Date.now()
    };

    const newSession: ChatSession = {
        id: Date.now().toString(),
        name: '新旅行计划',
        messages: [welcomeMsg],
        updatedAt: Date.now()
    };

    // Reset UI state
    setInput('');
    setCurrentMapData(null);
    setIsMapOpen(false);
    
    // IMPORTANT: Save immediately to history so it shows in sidebar
    updateSessionAndHistory(newSession);
  };

  const loadSession = (s: ChatSession) => {
      if (s.id === session.id) return;
      setSession(s);
  };

  const handleEditTitle = (e: React.MouseEvent, s: ChatSession) => {
      e.stopPropagation();
      setEditingSessionId(s.id);
      setTempTitle(s.name);
  };

  const saveTitle = (id: string) => {
      if (!tempTitle.trim()) {
          setEditingSessionId(null);
          return;
      }
      
      const newName = tempTitle.trim();
      
      setSessionsHistory(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
      if (session.id === id) {
          setSession(prev => ({ ...prev, name: newName }));
      }
      setEditingSessionId(null);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除这条行程记录吗？")) return;

    const newHistory = sessionsHistory.filter(s => s.id !== id);
    setSessionsHistory(newHistory);

    // If deleting current session
    if (session.id === id) {
        if (newHistory.length > 0) {
            setSession(newHistory[0]);
        } else {
            // If deleted everything, create a fresh one
            createNewSession();
        }
    }
  };

  // --- 4. Chat & AI Logic ---

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    // 1. Optimistic Update
    const sessionAfterUserMsg = {
        ...session,
        messages: [...session.messages, userMsg],
        updatedAt: Date.now()
    };
    updateSessionAndHistory(sessionAfterUserMsg);
    
    setInput('');
    setIsLoading(true);

    try {
      const responseStream = await sendMessageStream(
        null, 
        userMsg.text, 
        preferences,
        sessionAfterUserMsg.messages 
      );

      let fullText = '';
      const responseId = (Date.now() + 1).toString();
      
      // Add placeholder for AI response
      let currentSessionState = {
          ...sessionAfterUserMsg,
          messages: [...sessionAfterUserMsg.messages, { id: responseId, role: 'model' as const, text: '...', timestamp: Date.now() }]
      };
      
      updateSessionAndHistory(currentSessionState);

      for await (const chunk of responseStream) {
         if(chunk.text) {
             fullText += chunk.text;
             
             // Update local state for smooth typing effect
             currentSessionState = {
                 ...currentSessionState,
                 messages: currentSessionState.messages.map(m => 
                     m.id === responseId ? { ...m, text: fullText } : m
                 )
             };
             setSession(currentSessionState);
         }
      }

      // Sync final text to history
      updateSessionAndHistory(currentSessionState);

      // --- Post-Processing: Map & Title ---

      // 1. Map Data
      const { cleanedText, mapData } = extractMapData(fullText);
      let finalMapData = mapData;

      if (mapData) {
        setMapLoading(true);
        try {
            finalMapData = await enrichMapDataWithGeocoding(mapData, preferences.destination);
        } catch (err) {
            console.error("Geocoding failed", err);
        } finally {
            setMapLoading(false);
        }
      }

      // Update session with cleaned text and map data
      const finalSession = {
          ...currentSessionState,
          messages: currentSessionState.messages.map(m => 
              m.id === responseId 
              ? { ...m, text: cleanedText, mapData: finalMapData || undefined } 
              : m
          ),
          updatedAt: Date.now()
      };
      updateSessionAndHistory(finalSession);

      if (finalMapData) {
          setCurrentMapData(finalMapData);
          if (window.innerWidth > 768) setIsMapOpen(true);
      }

      // 2. Auto Title
      // Check if name is still default and we have content
      if ((finalSession.name === '新行程' || finalSession.name === '新旅行计划') && finalSession.messages.length >= 3) {
          generateSessionTitle(userMsg.text, cleanedText).then(newTitle => {
              const titledSession = { ...finalSession, name: newTitle };
              updateSessionAndHistory(titledSession);
          });
      }

    } catch (error) {
      console.error("AI Error:", error);
      const errorSession = {
          ...session,
          messages: [...session.messages, { id: Date.now().toString(), role: 'model' as const, text: "网络错误，请稍后重试。", timestamp: Date.now() }]
      };
      updateSessionAndHistory(errorSession);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden relative">
      
      {/* Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 shrink-0">
        <div className="p-4 border-b border-slate-800">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                AI 旅行助手
            </h1>
            <button 
                onClick={createNewSession}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm transition-colors shadow-sm"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                新建行程
            </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            <h3 className="text-xs font-semibold text-slate-500 px-2 py-2 uppercase tracking-wider">历史记录</h3>
            {sessionsHistory.length === 0 && <p className="px-2 text-sm text-slate-600 italic">暂无保存的行程。</p>}
            {sessionsHistory.map(s => (
                <div key={s.id} className="relative group">
                    {editingSessionId === s.id ? (
                        <div className="px-2 py-1">
                             <input
                                ref={titleInputRef}
                                type="text"
                                value={tempTitle}
                                onChange={(e) => setTempTitle(e.target.value)}
                                onBlur={() => saveTitle(s.id)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') saveTitle(s.id);
                                    if(e.key === 'Escape') setEditingSessionId(null);
                                }}
                                className="w-full bg-slate-800 text-white text-sm rounded px-2 py-1.5 border border-blue-500 outline-none"
                                autoFocus
                            />
                        </div>
                    ) : (
                        <button
                            onClick={() => loadSession(s)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-colors pr-16 border border-transparent ${
                                s.id === session.id 
                                ? 'bg-slate-800 text-white border-slate-700 shadow-sm' 
                                : 'hover:bg-slate-800/50 text-slate-300'
                            }`}
                        >
                           {s.name}
                        </button>
                    )}
                    
                    {/* Actions (Edit + Delete) */}
                    {editingSessionId !== s.id && (
                        <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity ${
                            s.id === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                            <button
                                onClick={(e) => handleEditTitle(e, s)}
                                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                                title="重命名"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </button>
                            <button
                                onClick={(e) => deleteSession(e, s.id)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
                                title="删除"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
        
        <div className="p-4 border-t border-slate-800">
             <div className="flex items-center gap-2 text-xs text-slate-500">
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                 <span>豆包模型在线</span>
             </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-full min-w-0">
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 z-10 shrink-0 shadow-sm">
            <div className="flex items-center gap-3 overflow-hidden">
                <span className="md:hidden font-bold text-gray-800 whitespace-nowrap">AI 助手</span>
                <span className="hidden md:inline-block font-medium text-gray-600 truncate max-w-[200px] lg:max-w-md">
                    {session.name} 
                    {session.name !== '新行程' && preferences.destination && session.name.indexOf(preferences.destination) === -1 && (
                         <span className="text-gray-400 text-sm ml-2">({preferences.destination})</span>
                    )}
                </span>
                {mapLoading && (
                    <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        正在更新坐标...
                    </span>
                )}
            </div>
            
            <div className="flex items-center space-x-2 md:space-x-4 shrink-0">
                <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => setIsMapOpen(!isMapOpen)}
                    className={isMapOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}
                >
                    <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 17.25V6.828a1 1 0 01.636-.954l12-6A1 1 0 0117 0v17.25a1 1 0 01-.636.954l-5.447 2.724A1 1 0 019 20z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    地图
                </Button>
                
                <Button variant="ghost" size="sm" onClick={() => setIsSettingsOpen(true)}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </Button>
            </div>
        </header>

        {/* Workspace: Chat + Map */}
        <div className="flex-1 flex overflow-hidden relative">
            {/* Chat Area */}
            <div className={`flex flex-col h-full transition-all duration-300 ease-in-out ${isMapOpen ? 'w-full md:w-1/2 lg:w-5/12' : 'w-full mx-auto max-w-4xl'}`}>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
                    {session.messages.map(msg => (
                        <ChatMessage 
                            key={msg.id} 
                            message={msg} 
                            onShowMap={() => {
                                if (msg.mapData) {
                                    setCurrentMapData(msg.mapData);
                                    if (!isMapOpen) setIsMapOpen(true);
                                }
                            }}
                        />
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                
                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-200">
                    <form onSubmit={handleSendMessage} className="relative max-w-4xl mx-auto flex items-end gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder="输入您的旅行要求..."
                            className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-3 px-2 text-gray-700 placeholder-gray-400"
                            rows={1}
                        />
                        <button 
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className={`p-2.5 rounded-xl transition-all ${
                                input.trim() && !isLoading
                                ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' 
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                             <svg className="w-5 h-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </form>
                    <p className="text-center text-xs text-gray-400 mt-2">
                        AI 可能会犯错。请核对重要信息。
                    </p>
                </div>
            </div>

            {/* Map Area - Desktop (Sliding / Split) */}
            <div className={`
                fixed inset-0 z-20 md:static md:z-0
                bg-white border-l border-gray-200 shadow-xl md:shadow-none
                transition-all duration-300 ease-in-out transform
                ${isMapOpen 
                    ? 'translate-x-0 w-full md:w-1/2 lg:w-7/12' 
                    : 'translate-x-full md:translate-x-0 md:w-0 overflow-hidden'
                }
            `}>
                <div className="h-full relative">
                     {/* Mobile Close Map Button */}
                    <button 
                        onClick={() => setIsMapOpen(false)}
                        className="md:hidden absolute top-4 left-4 z-50 bg-white p-2 rounded-full shadow-lg border border-gray-200 text-gray-700"
                    >
                         <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                         </svg>
                    </button>
                    
                    <MapContainer mapData={currentMapData} />
                    
                    {!currentMapData && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10 p-6 text-center pointer-events-none">
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 17.25V6.828a1 1 0 01.636-.954l12-6A1 1 0 0117 0v17.25a1 1 0 01-.636.954l-5.447 2.724A1 1 0 019 20z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-gray-800">尚未生成行程地图</h3>
                            <p className="text-sm text-gray-500 max-w-xs mt-2">
                                请在左侧输入您的旅行需求，地图将自动生成。
                            </p>
                        </div>
                    )}

                    {mapLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-50 backdrop-blur-[1px]">
                            <div className="bg-white px-5 py-3 rounded-xl shadow-xl flex items-center space-x-3 border border-gray-100">
                                <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">正在校准地图坐标...</p>
                                    <p className="text-xs text-gray-500">正在使用高德地图 API 搜索地点</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        preferences={preferences} 
        onSave={setPreferences} 
      />
    </div>
  );
}

export default App;