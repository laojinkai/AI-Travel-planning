export interface ItineraryPoint {
  name: string;
  city?: string; // City name for precise geocoding (e.g., "Beijing", "Hangzhou")
  address?: string; // Full structured address for best accuracy
  description: string;
  lat: number;
  lng: number;
  day?: number;
  category?: 'sightseeing' | 'food' | 'hotel' | 'other'; // New category field
}

export interface MapData {
  points: ItineraryPoint[];
  center?: [number, number];
  zoom?: number;
}

export interface UserPreferences {
  destination: string;
  origin: string;
  startDate: string;
  duration: number;
  travelers: number;
  budget: string;
  interests: string[];
  additionalInfo: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  // If the message contains parsed map data
  mapData?: MapData;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  updatedAt: number;
}