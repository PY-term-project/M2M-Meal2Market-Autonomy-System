import React, { useEffect, useRef, useState } from 'react';
import { Coordinate, Shipment } from '../types';

interface MapComponentProps {
  userLocation: Coordinate | null;
  shipments: Shipment[];
  status: string;
}

declare global {
  interface Window {
    L: any;
  }
}

const MapComponent: React.FC<MapComponentProps> = ({ userLocation, shipments, status }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);

  const [routesData, setRoutesData] = useState<any[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    if (!window.L) {
      console.error("Leaflet not loaded");
      return;
    }

    const map = window.L.map(mapContainerRef.current).setView([37.7749, -122.4194], 13);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;
    layerGroupRef.current = window.L.layerGroup().addTo(map);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const fetchRoutes = async () => {
      if (!shipments.length || !userLocation) {
        setRoutesData([]);
        return;
      }

      const promises = shipments.map(async (shipment) => {
        const start = shipment.supplier.location;
        const end = userLocation;
        const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
        
        try {
          const res = await fetch(url);
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            return {
              shipmentId: shipment.supplier.id,
              geometry: data.routes[0].geometry,
              coordinates: data.routes[0].geometry.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] }))
            };
          }
        } catch (e) {
          console.error("OSRM Fetch Failed", e);
        }
        return {
          shipmentId: shipment.supplier.id,
          geometry: null,
          coordinates: [start, end]
        };
      });

      const results = await Promise.all(promises);
      setRoutesData(results);
    };

    fetchRoutes();
  }, [shipments, userLocation]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    const layerGroup = layerGroupRef.current;
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const createMarkerIcon = (color: string, pulse: boolean = false) => {
      return window.L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="
          background-color: ${color};
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          position: relative;
        " class="${pulse ? 'marker-pulse' : ''}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
    };

    const createVeggieIcon = () => {
       return window.L.divIcon({
        className: 'veggie-icon',
        html: `<div style="font-size: 24px;">🥦</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
    };

    if (userLocation) {
      if (!userMarkerRef.current) {
        userMarkerRef.current = window.L.marker([userLocation.lat, userLocation.lng], {
          icon: createMarkerIcon('#4F46E5', true)
        }).addTo(map).bindPopup("You are here");
        map.setView([userLocation.lat, userLocation.lng], 14);
      } else {
        userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      }
    }

    layerGroup.clearLayers();

    const showRoutes = shipments.length > 0 && (status === 'PACKAGING' || status === 'DELIVERING' || status === 'COMPLETED');
    const isAnimating = status === 'DELIVERING';

    if (showRoutes && userLocation) {
      const bounds = window.L.latLngBounds([ [userLocation.lat, userLocation.lng] ]);
      const movingMarkers: any[] = [];

      shipments.forEach((shipment) => {
        const { supplier } = shipment;
        const color = supplier.isVirtual ? '#A855F7' : '#EF4444';

        const marker = window.L.marker([supplier.location.lat, supplier.location.lng], {
          icon: createMarkerIcon(color)
        }).bindPopup(`<b>${supplier.name}</b><br/>${shipment.items.length} items`);
        
        layerGroup.addLayer(marker);
        bounds.extend([supplier.location.lat, supplier.location.lng]);

        const routeData = routesData.find(r => r.shipmentId === supplier.id);
        
        if (routeData && routeData.geometry) {
           window.L.geoJSON(routeData.geometry, {
             style: { color: color, weight: 4, opacity: 0.6 }
           }).addTo(layerGroup);
        } else {
           const latlngs = [
             [supplier.location.lat, supplier.location.lng],
             [userLocation.lat, userLocation.lng]
           ];
           window.L.polyline(latlngs, {
             color: color, weight: 4, opacity: 0.5, dashArray: '10, 10'
           }).addTo(layerGroup);
        }

        if (isAnimating) {
           const veggieMarker = window.L.marker([supplier.location.lat, supplier.location.lng], {
             icon: createVeggieIcon(),
             zIndexOffset: 1000
           }).addTo(layerGroup);
           
           // REAL-TIME ANIMATION: 1 real second = 1 sim second
           // travelTime is in minutes. 
           // Duration (ms) = Minutes * 60 * 1000
           const duration = shipment.travelTime * 60 * 1000; 

           const pathCoords = routeData ? routeData.coordinates : [supplier.location, userLocation];

           movingMarkers.push({
             marker: veggieMarker,
             path: pathCoords,
             duration: duration
           });
        }
      });

      map.fitBounds(bounds, { padding: [50, 50] });

      if (isAnimating && movingMarkers.length > 0) {
        const startTime = Date.now();
        
        const animate = () => {
          const now = Date.now();
          let allFinished = true;

          movingMarkers.forEach(item => {
            const progress = Math.min((now - startTime) / item.duration, 1);
            if (progress < 1) allFinished = false;

            const totalPoints = item.path.length;
            const idx = Math.min(Math.floor(progress * (totalPoints - 1)), totalPoints - 2);
            
            const p1 = item.path[idx];
            const p2 = item.path[idx + 1];

            if (p1 && p2) {
               const segmentProgress = (progress * (totalPoints - 1)) % 1;
               
               const lat = p1.lat + (p2.lat - p1.lat) * segmentProgress;
               const lng = p1.lng + (p2.lng - p1.lng) * segmentProgress;
               
               item.marker.setLatLng([lat, lng]);
            }
          });

          if (!allFinished) {
            animationRef.current = requestAnimationFrame(animate);
          }
        };
        animationRef.current = requestAnimationFrame(animate);
      }
    }

  }, [userLocation, shipments, status, routesData]);

  return (
    <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden shadow-inner relative z-0">
       <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '100%' }} />
    </div>
  );
};

export default MapComponent;