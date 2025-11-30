
import React, { useEffect, useRef } from 'react';
import { MapData, ItineraryPoint } from '../types';

declare global {
  interface Window {
    AMap: any;
  }
}

interface MapContainerProps {
  mapData: MapData | null;
  className?: string;
}

// Distinct colors for different days (Tailwind-like palette)
const DAY_COLORS = [
  '#3b82f6', // Blue-500 (Day 1)
  '#10b981', // Emerald-500 (Day 2)
  '#f59e0b', // Amber-500 (Day 3)
  '#ef4444', // Red-500 (Day 4)
  '#8b5cf6', // Violet-500 (Day 5)
  '#ec4899', // Pink-500 (Day 6)
  '#06b6d4', // Cyan-500 (Day 7)
  '#84cc16', // Lime-500 (Day 8)
  '#f97316', // Orange-500 (Day 9)
  '#6366f1', // Indigo-500 (Day 10)
];

const getCategoryIcon = (category?: string) => {
    switch(category) {
        case 'food': return '🍴';
        case 'hotel': return '🏨';
        case 'sightseeing': 
        default: return '📷';
    }
};

export const MapContainer: React.FC<MapContainerProps> = ({ mapData, className }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]); 

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || !window.AMap) return;

    if (!mapInstance.current) {
      mapInstance.current = new window.AMap.Map(mapRef.current, {
        zoom: 11,
        center: [116.397428, 39.90923], // Default Beijing
        viewMode: '2D', // Use 2D for cleaner travel map look
        resizeEnable: true
      });
      
      mapInstance.current.addControl(new window.AMap.Scale());
      mapInstance.current.addControl(new window.AMap.ToolBar({
        position: 'RB',
        liteStyle: true
      }));
    }

    return () => {
        if(mapInstance.current) {
            mapInstance.current.destroy();
            mapInstance.current = null;
        }
    }
  }, []);

  // Update Markers and Route
  useEffect(() => {
    if (!mapInstance.current || !window.AMap || !mapData) return;
    
    // 1. Clear existing overlays
    mapInstance.current.remove(markersRef.current);
    markersRef.current = [];
    if (polylinesRef.current.length > 0) {
      mapInstance.current.remove(polylinesRef.current);
      polylinesRef.current = [];
    }

    if (!mapData.points || mapData.points.length === 0) return;

    // 2. Pre-process Data: Sort by Day, then keep original sequence
    // We assume the AI outputs points in chronological order within the JSON.
    // But we strictly sort by Day to prevent Day 2 appearing before Day 1 visually if array is jumbled.
    const sortedPoints = [...mapData.points].sort((a, b) => {
        const dayA = a.day || 1;
        const dayB = b.day || 1;
        return dayA - dayB;
    });

    const pathsByDay: { [key: number]: any[] } = {};
    const pointsByDay: { [key: number]: ItineraryPoint[] } = {};

    // Group by Day
    sortedPoints.forEach(point => {
        const day = point.day || 1;
        if (!pointsByDay[day]) pointsByDay[day] = [];
        pointsByDay[day].push(point);
    });

    // 3. Render Loop
    Object.keys(pointsByDay).forEach((dayKey) => {
        const day = parseInt(dayKey);
        const dayPoints = pointsByDay[day];
        const colorIndex = (day - 1) % DAY_COLORS.length;
        const themeColor = DAY_COLORS[colorIndex];
        
        const path: any[] = [];

        dayPoints.forEach((point, index) => {
             // Ensure lat/lng are numbers and not (0,0) unless logic allows (our logic allows corrected ones)
             // We still filter totally invalid ones to avoid ocean view
             const lat = Number(point.lat);
             const lng = Number(point.lng);
             
             if (isNaN(lat) || isNaN(lng) || (Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1)) {
                  return;
             }

             const position = new window.AMap.LngLat(lng, lat);
             path.push(position);

             // Marker Design
             // Numbering restarts every day (index + 1)
             const dayIndex = index + 1;
             const categoryIcon = getCategoryIcon(point.category);
             const safeName = point.name.replace(/"/g, '&quot;');
             
             const markerContent = `
                <div class="amap-custom-marker" style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
                    <div style="
                        background-color: white; 
                        padding: 4px 8px; 
                        border-radius: 6px; 
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2); 
                        font-size: 12px; 
                        font-weight: 600; 
                        color: #1f2937; 
                        margin-bottom: 4px; 
                        white-space: nowrap; 
                        border: 1px solid #f3f4f6;
                        border-left: 3px solid ${themeColor};
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    ">
                        <span>${categoryIcon}</span>
                        <span>${safeName}</span>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; align-items: center; position: relative;">
                        <div style="
                            width: 24px; 
                            height: 24px; 
                            background-color: ${themeColor}; 
                            border: 2px solid white; 
                            border-radius: 50%; 
                            color: white; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            font-size: 12px; 
                            font-weight: bold; 
                            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                            z-index: 2;
                        ">
                            ${dayIndex}
                        </div>
                        <div style="
                            width: 0; 
                            height: 0; 
                            border-left: 6px solid transparent; 
                            border-right: 6px solid transparent; 
                            border-top: 8px solid ${themeColor}; 
                            margin-top: -2px;
                            filter: drop-shadow(0 2px 1px rgba(0,0,0,0.1));
                        "></div>
                    </div>
                </div>
            `;

            const marker = new window.AMap.Marker({
                position: position,
                content: markerContent,
                offset: new window.AMap.Pixel(0, 0),
                anchor: 'bottom-center',
                zIndex: 100 + index
            });

            const infoWindow = new window.AMap.InfoWindow({
                content: `
                    <div style="padding: 8px; min-width: 220px;">
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                            <span style="font-size:16px;">${categoryIcon}</span>
                            <h4 style="font-weight:bold; font-size: 15px; color: #111; margin:0;">${point.name}</h4>
                        </div>
                        <div style="font-size: 12px; color: #666; line-height: 1.5; margin-bottom: 6px;">${point.description}</div>
                        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">${point.address || point.city || ''}</div>
                        <div style="margin-top:4px;">
                            <span style="font-size: 10px; color: white; background: ${themeColor}; display: inline-block; padding: 2px 6px; border-radius: 4px;">Day ${day} - 第${dayIndex}站</span>
                            ${point.category ? `<span style="font-size: 10px; color: #555; background: #eee; display: inline-block; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">${point.category === 'food' ? '餐饮' : point.category === 'hotel' ? '住宿' : '景点'}</span>` : ''}
                        </div>
                    </div>
                `,
                offset: new window.AMap.Pixel(0, -45)
            });

            marker.on('click', () => {
                infoWindow.open(mapInstance.current, position);
            });

            markersRef.current.push(marker);
        });

        // Store path for polyline
        pathsByDay[day] = path;
    });

    mapInstance.current.add(markersRef.current);

    // 4. Draw Polylines
    Object.keys(pathsByDay).forEach((dayKey) => {
        const day = parseInt(dayKey);
        const path = pathsByDay[day];
        
        if (path.length > 0) {
            const colorIndex = (day - 1) % DAY_COLORS.length;
            const themeColor = DAY_COLORS[colorIndex];

            const polyline = new window.AMap.Polyline({
                path: path,
                isOutline: true,
                outlineColor: 'rgba(255,255,255,0.9)',
                borderWeight: 2,
                strokeColor: themeColor, 
                strokeOpacity: 0.9,
                strokeWeight: 5,
                strokeStyle: "solid",
                lineJoin: 'round',
                lineCap: 'round',
                zIndex: 50,
                showDir: true
            });
            
            polylinesRef.current.push(polyline);
        }
    });
    
    mapInstance.current.add(polylinesRef.current);

    // 5. Fit View
    if (markersRef.current.length > 0) {
        mapInstance.current.setFitView(markersRef.current, false, [60, 60, 60, 60]);
    }

  }, [mapData]);

  return (
    <div className={`relative w-full h-full bg-gray-100 ${className}`}>
        <div ref={mapRef} className="w-full h-full" style={{ touchAction: 'none' }} />
        
        {/* Updated Legend Overlay */}
        {mapData && mapData.points && mapData.points.length > 0 && (
            <div className="absolute bottom-6 left-4 bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-200 text-xs max-h-48 overflow-y-auto pointer-events-auto min-w-[120px]">
                <div className="font-semibold text-gray-700 mb-2 border-b border-gray-100 pb-1">行程图例</div>
                <div className="space-y-2">
                    {/* Color Legend */}
                    {Array.from(new Set(mapData.points.map(p => Number(p.day || 1)))).sort((a,b) => a-b).map(day => (
                        <div key={day} className="flex items-center gap-2">
                            <div 
                                className="w-3 h-3 rounded-full shadow-sm" 
                                style={{ backgroundColor: DAY_COLORS[(day - 1) % DAY_COLORS.length] }}
                            ></div>
                            <span className="text-gray-600 font-medium">第 {day} 天</span>
                        </div>
                    ))}
                    
                    {/* Icon Legend */}
                    <div className="pt-2 border-t border-gray-100 mt-2 space-y-1.5 text-gray-500">
                         <div className="flex items-center gap-2">
                            <span>📷</span> <span>景点</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <span>🍴</span> <span>餐饮</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <span>🏨</span> <span>住宿</span>
                         </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
