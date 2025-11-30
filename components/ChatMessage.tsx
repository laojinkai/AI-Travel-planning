import React from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  onShowMap: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onShowMap }) => {
  const isUser = message.role === 'user';
  
  // Basic markdown-ish parsing for bold text and newlines
  const formatText = (text: string) => {
    return text.split('\n').map((line, i) => (
      <React.Fragment key={i}>
        {line.split(/(\*\*.*?\*\*)/).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          return <span key={j}>{part}</span>;
        })}
        <br />
      </React.Fragment>
    ));
  };

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
          isUser ? 'bg-blue-600 text-white ml-3' : 'bg-teal-600 text-white mr-3'
        }`}>
          {isUser ? '我' : 'AI'}
        </div>

        {/* Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`relative px-5 py-3.5 shadow-sm rounded-2xl ${
            isUser 
              ? 'bg-blue-600 text-white rounded-tr-none' 
              : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
          }`}>
             <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {isUser ? message.text : formatText(message.text)}
             </div>
          </div>
          
          {/* Action button if map data exists in this message */}
          {!isUser && message.mapData && (
             <button 
                onClick={onShowMap}
                className="mt-2 flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full transition-colors border border-blue-100"
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 17.25V6.828a1 1 0 01.636-.954l12-6A1 1 0 0117 0v17.25a1 1 0 01-.636.954l-5.447 2.724A1 1 0 019 20z" />
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                <span>在地图上查看行程</span>
             </button>
          )}
          
           <span className="text-[10px] text-gray-400 mt-1 select-none">
              {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
           </span>
        </div>
      </div>
    </div>
  );
};