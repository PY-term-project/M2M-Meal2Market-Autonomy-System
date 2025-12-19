import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import MapComponent from './components/MapComponent';
import ManagerDashboard from './components/ManagerDashboard';
import { Coordinate, OrderDetails } from './types';

const App: React.FC = () => {
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [showManager, setShowManager] = useState(false);
  
  // Mobile Tab State
  const [activeTab, setActiveTab] = useState<'chat' | 'map'>('chat');

  const [orderDetails, setOrderDetails] = useState<OrderDetails>({
    meal: '',
    headcount: 0,
    shipments: [], 
    status: 'PENDING'
  });

  // Auto-switch to map on mobile when delivery starts
  useEffect(() => {
    if (orderDetails.status === 'PACKAGING' || orderDetails.status === 'DELIVERING') {
      setActiveTab('map');
    }
  }, [orderDetails.status]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-2 md:p-8 relative">
      
      {/* Manager Trigger */}
      <button 
        onClick={() => setShowManager(true)}
        className="absolute top-4 right-4 md:right-8 z-40 bg-white/50 hover:bg-white p-2 rounded-full shadow-sm transition-all border border-transparent hover:border-gray-200 group"
        title="Manager Access"
      >
        <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
      </button>

      {/* Mobile Tab Controls */}
      <div className="md:hidden w-full max-w-7xl mb-3">
        <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all duration-200 ${
              activeTab === 'chat' 
                ? 'bg-slate-800 text-white shadow-md transform scale-[1.02]' 
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Chat Agent
          </button>
          <button 
            onClick={() => setActiveTab('map')}
            className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all duration-200 ${
              activeTab === 'map' 
                ? 'bg-blue-600 text-white shadow-md transform scale-[1.02]' 
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Live Map {orderDetails.status === 'DELIVERING' && <span className="ml-1 animate-pulse">🔴</span>}
          </button>
        </div>
      </div>

      <div className="w-full max-w-7xl h-[85vh] grid grid-cols-1 md:grid-cols-12 gap-6 relative">
        
        {/* Left: Chat Interface (4 cols) - Mobile conditional display */}
        <div className={`md:col-span-4 h-full ${activeTab === 'chat' ? 'block' : 'hidden md:block'}`}>
          <ChatInterface 
            onLocationUpdate={setUserLocation}
            onOrderUpdate={setOrderDetails}
            userLocation={userLocation}
            orderDetails={orderDetails}
          />
        </div>

        {/* Right: Map Visualization (8 cols) - Mobile conditional display */}
        <div className={`md:col-span-8 h-full bg-white rounded-2xl shadow-xl border border-gray-200 p-2 flex flex-col relative ${
          activeTab === 'map' ? 'block' : 'hidden md:block'
        }`}>
          
          {/* Status Bar Overlay */}
          <div className="absolute top-6 left-6 right-6 z-10 flex flex-col md:flex-row gap-2 pointer-events-none">
             {orderDetails.status !== 'PENDING' && (
               <div className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg border border-gray-200 text-sm font-medium text-gray-700 flex items-center gap-2 animate-fade-in-down w-fit">
                 <span className={`w-2 h-2 rounded-full ${
                   orderDetails.status === 'COMPLETED' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'
                 }`} />
                 <span className="whitespace-nowrap">Status: {orderDetails.status}</span>
               </div>
             )}
             {userLocation && (
               <div className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg border border-gray-200 text-sm font-medium text-gray-700 flex items-center gap-2 animate-fade-in-down delay-75 w-fit">
                 <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                 <span className="whitespace-nowrap">Loc: Active</span>
               </div>
             )}
          </div>

          <MapComponent 
            userLocation={userLocation} 
            shipments={orderDetails.shipments}
            status={orderDetails.status}
          />
        </div>
      </div>

      {/* Manager Dashboard Overlay */}
      {showManager && (
        <ManagerDashboard 
          onClose={() => setShowManager(false)} 
          userLocation={userLocation}
        />
      )}
    </div>
  );
};

export default App;