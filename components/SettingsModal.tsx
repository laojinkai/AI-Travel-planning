import React, { useState } from 'react';
import { UserPreferences } from '../types';
import { Button } from './Button';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onSave: (prefs: UserPreferences) => void;
}

const INTERESTS_OPTIONS = [
  "历史文化", "自然风光", "美食探店", 
  "探险运动", "艺术博物馆", "购物", 
  "休闲度假", "夜生活", "摄影", "亲子游"
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, preferences, onSave }) => {
  const [formData, setFormData] = useState<UserPreferences>(preferences);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleInterestToggle = (interest: string) => {
    setFormData(prev => {
      const exists = prev.interests.includes(interest);
      if (exists) {
        return { ...prev, interests: prev.interests.filter(i => i !== interest) };
      } else {
        return { ...prev, interests: [...prev.interests, interest] };
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-gray-900">旅行偏好设置</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">目的地</label>
                    <input 
                        type="text" 
                        name="destination"
                        value={formData.destination} 
                        onChange={handleChange}
                        placeholder="例如：北京、东京"
                        className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">出发地（选填）</label>
                    <input 
                        type="text" 
                        name="origin"
                        value={formData.origin} 
                        onChange={handleChange}
                        placeholder="例如：上海"
                        className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">出发日期</label>
                    <input 
                        type="date" 
                        name="startDate"
                        value={formData.startDate} 
                        onChange={handleChange}
                        className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">行程天数</label>
                    <input 
                        type="number" 
                        name="duration"
                        min={1}
                        max={30}
                        value={formData.duration} 
                        onChange={handleChange}
                        className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">出行人数</label>
                    <input 
                        type="number" 
                        name="travelers"
                        min={1}
                        value={formData.travelers} 
                        onChange={handleChange}
                        className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">预算</label>
                <select 
                    name="budget" 
                    value={formData.budget} 
                    onChange={handleChange}
                    className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                    <option value="Economy">经济型 (高性价比)</option>
                    <option value="Medium">舒适型 (平衡)</option>
                    <option value="High">高端型 (舒适)</option>
                    <option value="Luxury">奢华型 (不差钱)</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">兴趣爱好</label>
                <div className="flex flex-wrap gap-2">
                    {INTERESTS_OPTIONS.map(interest => (
                        <button
                            key={interest}
                            onClick={() => handleInterestToggle(interest)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                formData.interests.includes(interest)
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {interest}
                        </button>
                    ))}
                </div>
            </div>
            
            <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">额外备注</label>
                 <textarea
                    name="additionalInfo"
                    value={formData.additionalInfo}
                    onChange={handleChange}
                    placeholder="饮食禁忌、无障碍需求、必去的景点..."
                    rows={3}
                    className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                 />
            </div>

        </div>
        
        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button variant="primary" onClick={() => { onSave(formData); onClose(); }}>保存设置</Button>
        </div>
      </div>
    </div>
  );
};