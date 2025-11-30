import { MapData, ItineraryPoint } from "../types";

// Regex to find the custom json block
const JSON_BLOCK_REGEX = /```json_itinerary\s*([\s\S]*?)\s*```/;

export const extractMapData = (text: string): { cleanedText: string; mapData: MapData | null } => {
  const match = text.match(JSON_BLOCK_REGEX);
  
  if (match && match[1]) {
    try {
      const jsonStr = match[1];
      const parsed = JSON.parse(jsonStr);
      
      // Basic validation
      if (parsed && Array.isArray(parsed.points)) {
        // Remove the JSON block from the text to keep UI clean
        const cleanedText = text.replace(JSON_BLOCK_REGEX, '').trim();
        return {
          cleanedText,
          mapData: parsed as MapData
        };
      }
    } catch (e) {
      console.error("Failed to parse map JSON from AI response", e);
    }
  }

  return { cleanedText: text, mapData: null };
};

// Helper to clean up names (e.g. "West Lake (Xihu)" -> "West Lake")
const cleanPoiName = (name: string) => {
  return name.replace(/[\(（].*?[\)）]/g, '').trim();
};

/**
 * Uses AMap PlaceSearch to find real coordinates for points.
 * PROCESSES SERIALLY to avoid QPS limits.
 */
export const enrichMapDataWithGeocoding = async (mapData: MapData, defaultCity?: string): Promise<MapData> => {
  // Wait for AMap to load if it's not ready yet
  if (!window.AMap) {
      await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!window.AMap || !window.AMap.PlaceSearch) {
    console.warn("AMap plugins (PlaceSearch) not loaded. Returning original data.");
    return mapData;
  }

  const placeSearch = new window.AMap.PlaceSearch({ pageSize: 1, extensions: 'base' });
  const geocoder = window.AMap.Geocoder ? new window.AMap.Geocoder() : null;

  // --- Helpers ---
  
  // 1. Search by POI Name (Most accurate for landmarks)
  const searchByKeyword = (keyword: string, city?: string): Promise<any> => {
      return new Promise((resolve) => {
          if (!keyword) { resolve(null); return; }
          if (city) placeSearch.setCity(city);
          else placeSearch.setCity('全国');
          
          placeSearch.search(keyword, (status: string, result: any) => {
              if (status === 'complete' && result.info === 'OK' && result.poiList?.pois?.length > 0) {
                  resolve(result.poiList.pois[0].location);
              } else {
                  resolve(null);
              }
          });
      });
  };

  // 2. Search by Address (Fallback)
  const searchByAddress = (address: string, city?: string): Promise<any> => {
      return new Promise((resolve) => {
          if (!geocoder || !address) { resolve(null); return; }
          // Geocoder usually infers city from address, but we can't explicitly setCity on the instance easily dynamically without recreating
          geocoder.getLocation(address, (status: string, result: any) => {
              if (status === 'complete' && result.info === 'OK' && result.geocodes?.length > 0) {
                  resolve(result.geocodes[0].location);
              } else {
                  resolve(null);
              }
          });
      });
  };

  // --- Serial Processing Loop ---
  const updatedPoints: ItineraryPoint[] = [];
  let lastValidLocation: {lat: number, lng: number} | null = null;

  for (const point of mapData.points) {
      let lat = 0;
      let lng = 0;
      let found = false;
      const cityToUse = point.city || defaultCity || '';

      // Strategy 1: Name + City (Highest Priority per user request)
      // e.g. "雷峰塔" + "杭州市"
      if (!found) {
          const loc = await searchByKeyword(point.name, cityToUse);
          if (loc) { lat = loc.lat; lng = loc.lng; found = true; console.debug(`Found [${point.name}] via Name`); }
      }

      // Strategy 2: Cleaned Name + City
      // e.g. "雷峰塔(景区)" -> "雷峰塔"
      if (!found) {
          const clean = cleanPoiName(point.name);
          if (clean !== point.name) {
              const loc = await searchByKeyword(clean, cityToUse);
              if (loc) { lat = loc.lat; lng = loc.lng; found = true; console.debug(`Found [${point.name}] via CleanName`); }
          }
      }

      // Strategy 3: Address Geocoding
      if (!found && point.address) {
          const loc = await searchByAddress(point.address, cityToUse);
          if (loc) { lat = loc.lat; lng = loc.lng; found = true; console.debug(`Found [${point.name}] via Address`); }
      }
      
      // Strategy 4: City Center (Fallback to ensure it appears on map)
      if (!found && cityToUse) {
           const loc = await searchByKeyword(cityToUse, cityToUse);
           if (loc) { lat = loc.lat; lng = loc.lng; found = true; console.debug(`Fallback [${point.name}] to City Center`); }
      }

      // Strategy 5: Last Valid Point with Offset (Visual stacking prevention)
      if (!found && lastValidLocation) {
          // Add a tiny random offset so markers don't perfectly overlap
          lat = lastValidLocation.lat + (Math.random() * 0.005 - 0.0025);
          lng = lastValidLocation.lng + (Math.random() * 0.005 - 0.0025);
          found = true; 
          console.debug(`Fallback [${point.name}] to Last Valid`);
      }

      const newPoint = { ...point, lat, lng };
      updatedPoints.push(newPoint);

      if (found && lat !== 0) {
          lastValidLocation = { lat, lng };
      }

      // CRITICAL: Delay between requests to avoid AMap QPS limit (High frequency calls cause failure)
      await new Promise(r => setTimeout(r, 150));
  }
  
  return {
    ...mapData,
    points: updatedPoints
  };
};