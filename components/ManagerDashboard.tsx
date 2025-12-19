import React, { useState, useEffect } from 'react';
import { Supplier, Coordinate } from '../types';
import { getActiveSuppliers, getDistance } from '../services/mockDataService';

interface ManagerDashboardProps {
  onClose: () => void;
  userLocation: Coordinate | null;
}

const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ onClose, userLocation }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      setSuppliers(getActiveSuppliers());
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'IamManager') {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Invalid Access Key');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-slate-800 text-white rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">Manager Access</h2>
            <p className="text-sm text-gray-500">Authorized Personnel Only</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Access Key"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                autoFocus
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-lg transition-colors"
            >
              Verify Identity
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 text-white p-4 shadow-md flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            Supplier Management Dashboard
          </h1>
          <p className="text-xs text-slate-400">Viewing real-time inventory for active session</p>
        </div>
        <button 
          onClick={onClose}
          className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          Close Dashboard
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {suppliers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-lg font-medium">No suppliers generated yet.</p>
            <p className="text-sm">Start a chat session and share location to generate local supplier data.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {suppliers.map((supplier) => {
              const dist = userLocation ? getDistance(userLocation, supplier.location).toFixed(2) : 'N/A';
              const inventoryList = (Object.entries(supplier.inventory) as [string, number][])
                .filter(([_, qty]) => qty > 0)
                .sort((a, b) => b[1] - a[1]); // Sort by quantity descending

              return (
                <div key={supplier.id} className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-96">
                  <div className="p-3 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-slate-800 text-sm">{supplier.name}</h3>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
                        {dist} km
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">ID: {supplier.id}</div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Inventory Stock</div>
                    <div className="space-y-1">
                      {inventoryList.map(([item, qty]) => (
                        <div key={item} className="flex justify-between text-sm border-b border-gray-50 last:border-0 py-1 hover:bg-gray-50">
                          <span className="capitalize text-gray-700">{item}</span>
                          <span className={`font-mono ${qty < 100 ? 'text-red-500' : 'text-green-600'}`}>
                            {qty}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="p-2 border-t border-gray-100 bg-gray-50 text-[10px] text-center text-gray-400">
                    Total SKU: {inventoryList.length}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagerDashboard;