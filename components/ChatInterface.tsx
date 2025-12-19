import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, Coordinate, OrderDetails, AppStep, Shipment, Ingredient } from '../types';
import { initializeGemini, parseMealRequest, findNearestSupermarket } from '../services/geminiService';
import { generateSuppliers, createSourcingPlan, getInventoryKeys, getDistance } from '../services/mockDataService';

interface ChatInterfaceProps {
  onLocationUpdate: (loc: Coordinate) => void;
  onOrderUpdate: React.Dispatch<React.SetStateAction<OrderDetails>>;
  userLocation: Coordinate | null;
  orderDetails: OrderDetails;
}

// Sub-component for Interactive Ingredient Selection
const IngredientSelector: React.FC<{
  initialIngredients: Ingredient[];
  onConfirm: (selected: Ingredient[]) => void;
  disabled: boolean;
}> = ({ initialIngredients, onConfirm, disabled }) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');

  useEffect(() => {
    if (!disabled && initialIngredients.length > 0 && ingredients.length === 0) {
      setIngredients(initialIngredients);
      setSelectedIndices(new Set(initialIngredients.map((_, i) => i)));
    } else if (!disabled && initialIngredients.length > 0 && ingredients.length === initialIngredients.length) {
       if (ingredients[0]?.name !== initialIngredients[0]?.name) {
         setIngredients(initialIngredients);
         setSelectedIndices(new Set(initialIngredients.map((_, i) => i)));
       }
    }
  }, [initialIngredients, disabled]);

  const toggleIngredient = (index: number) => {
    if (disabled) return;
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  const handleAddItem = () => {
    if (!newItemName || !newItemQty || !newItemUnit) return;
    
    const qty = parseFloat(newItemQty);
    if (isNaN(qty)) return;

    const newItem: Ingredient = {
      name: newItemName,
      quantity: qty,
      unit: newItemUnit
    };

    const newIngredients = [...ingredients, newItem];
    setIngredients(newIngredients);
    
    const newSet = new Set(selectedIndices);
    newSet.add(newIngredients.length - 1);
    setSelectedIndices(newSet);

    setNewItemName('');
    setNewItemQty('');
    setNewItemUnit('');
  };

  const handleConfirm = () => {
    const selectedItems = ingredients.filter((_, i) => selectedIndices.has(i));
    onConfirm(selectedItems);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mt-2 space-y-3 w-full max-w-sm">
      <div className="text-sm font-bold text-gray-700">Select items to buy:</div>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {ingredients.map((ing, idx) => (
          <div 
            key={idx} 
            className={`flex items-center justify-between p-2 rounded-md border transition-colors ${
              selectedIndices.has(idx) ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50 opacity-60'
            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-blue-300'}`}
            onClick={() => toggleIngredient(idx)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                selectedIndices.has(idx) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
              }`}>
                {selectedIndices.has(idx) && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                )}
              </div>
              <span className="text-sm text-gray-800 font-medium">{ing.name}</span>
            </div>
            <span className="text-xs text-gray-500">{ing.quantity} {ing.unit}</span>
          </div>
        ))}
      </div>

      {!disabled && (
        <div className="bg-gray-50 p-2 rounded-lg border border-gray-200">
           <div className="text-xs font-semibold text-gray-500 mb-2">Add Missing Item:</div>
           <div className="flex gap-2 mb-2">
             <input 
               type="text" placeholder="Item" className="w-1/2 p-1 text-xs border rounded"
               value={newItemName} onChange={e => setNewItemName(e.target.value)}
             />
             <input 
               type="text" placeholder="Qty" className="w-1/4 p-1 text-xs border rounded"
               value={newItemQty} onChange={e => setNewItemQty(e.target.value)}
             />
             <input 
               type="text" placeholder="Unit" className="w-1/4 p-1 text-xs border rounded"
               value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}
             />
           </div>
           <button 
             onClick={handleAddItem}
             disabled={!newItemName || !newItemQty || !newItemUnit}
             className="w-full bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs py-1 rounded transition-colors"
           >
             + Add to List
           </button>
        </div>
      )}

      {!disabled && (
        <button 
          onClick={handleConfirm}
          disabled={selectedIndices.size === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <span>Find Suppliers for {selectedIndices.size} Items</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
        </button>
      )}
      {disabled && (
        <div className="text-center text-xs text-gray-400 font-medium italic">Selection Confirmed</div>
      )}
    </div>
  );
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  onLocationUpdate, 
  onOrderUpdate, 
  userLocation, 
  orderDetails
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<AppStep>(AppStep.DEMAND_GATHERING);
  const [pendingMeal, setPendingMeal] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addMessage = useCallback((sender: 'user' | 'agent' | 'system', text: string, type: ChatMessage['type'] = 'text', data?: any) => {
    const newMsg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      sender,
      text,
      timestamp: new Date(),
      type,
      data
    };
    setMessages(prev => [...prev, newMsg]);
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      addMessage('system', "Welcome to MealAgent.");
      addMessage('agent', "What would you like to eat today?");
      
      if (process.env.API_KEY) {
        initializeGemini(process.env.API_KEY);
      }
    }
  }, [addMessage]); 

  // Delivery Completion Watcher
  useEffect(() => {
    let deliveryTimer: ReturnType<typeof setTimeout>;

    if (orderDetails.status === 'DELIVERING' && orderDetails.shipments.length > 0) {
      // REAL-TIME SIMULATION: 1 sim second = 1 real second.
      const maxTravelTimeMinutes = Math.max(...orderDetails.shipments.map(s => s.travelTime));
      const simulationDurationMs = maxTravelTimeMinutes * 60 * 1000;

      deliveryTimer = setTimeout(() => {
        onOrderUpdate(prev => ({ ...prev, status: 'COMPLETED' }));
        addMessage('system', "Delivery confirmed.");
        addMessage('agent', "All items have been delivered! Bon appétit! 🍽️");
      }, simulationDurationMs + 500); 
    }

    return () => {
      if (deliveryTimer) clearTimeout(deliveryTimer);
    };
  }, [orderDetails.status, orderDetails.shipments, addMessage, onOrderUpdate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCancelOrder = () => {
    if (orderDetails.status === 'COMPLETED' || orderDetails.status === 'CANCELLED') {
      addMessage('agent', "It's too late to cancel this order, or it has already been processed.");
      return;
    }
    
    onOrderUpdate(prev => ({
      ...prev,
      status: 'CANCELLED'
    }));
    setStep(AppStep.DEMAND_GATHERING);
    setPendingMeal(null);
    addMessage('system', "Order has been successfully cancelled.");
    addMessage('agent', "Order cancelled. What would you like to eat instead?");
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    const userText = input;
    setInput('');
    addMessage('user', userText);

    if (step === AppStep.DELIVERY && userText.toLowerCase().includes('cancel')) {
      handleCancelOrder();
      return;
    }

    if (step === AppStep.DEMAND_GATHERING) {
      setIsLoading(true);
      
      let currentMeal = pendingMeal || userText;
      let currentHeadcount = 0;

      const numMatch = userText.match(/(\d+)/);
      const numberInInput = numMatch ? parseInt(numMatch[0]) : null;

      if (pendingMeal) {
          if (numberInInput) {
             currentHeadcount = numberInInput;
             setPendingMeal(null);
          } else {
             setIsLoading(false);
             addMessage('agent', "I need a number to estimate quantities. How many people are eating?");
             return;
          }
      } else {
          if (numberInInput) {
             currentHeadcount = numberInInput;
             currentMeal = userText; 
          } else {
             setPendingMeal(userText);
             setIsLoading(false);
             addMessage('agent', "Sounds good! How many people are you cooking for?");
             return;
          }
      }
      
      onOrderUpdate(prev => ({
        ...prev,
        meal: currentMeal,
        headcount: currentHeadcount
      }));

      if (userLocation) {
        addMessage('agent', `Got it. Analyzing recipe for "${currentMeal}" for ${currentHeadcount} people...`);
        setStep(AppStep.PROCESSING);
        analyzeRequest(currentMeal, currentHeadcount);
      } else {
        addMessage('agent', `A feast for ${currentHeadcount}. Please share your location so I can check local inventory.`, 'location-request');
        setStep(AppStep.LOCATION_GATHERING);
        setIsLoading(false);
      }
    } else if (step === AppStep.DELIVERY) {
      addMessage('agent', "Your order is on the way! You can type 'cancel' to stop the order if needed.");
    }
  };

  const handleShareLocation = () => {
    setIsLoading(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
          onLocationUpdate(loc);
          addMessage('user', '📍 Shared Location');
          
          setStep(AppStep.PROCESSING);
          analyzeRequest(orderDetails.meal, orderDetails.headcount);
        },
        (error) => {
          setIsLoading(false);
          addMessage('system', `Error getting location: ${error.message}. Please try again or type coordinates.`);
        }
      );
    } else {
      setIsLoading(false);
      addMessage('system', "Geolocation is not supported by your browser.");
    }
  };

  const handleRegenerateRecipe = () => {
    addMessage('user', 'Show me a different recipe.');
    setStep(AppStep.PROCESSING);
    analyzeRequest(orderDetails.meal, orderDetails.headcount, true);
  };

  const analyzeRequest = async (meal: string, headcount: number, isVariation: boolean = false) => {
    try {
      setIsLoading(true);
      
      const inventoryKeys = getInventoryKeys();
      const analysis = await parseMealRequest(meal, headcount, inventoryKeys, isVariation);
      
      if (!analysis) {
        setIsLoading(false);
        addMessage('agent', "I had trouble understanding the recipe. Could you rephrase your meal request?");
        setStep(AppStep.DEMAND_GATHERING);
        return;
      }

      addMessage('agent', `Here is a ${isVariation ? 'different' : 'recommended'} recipe for ${meal}:`, 'recipe-card', analysis);
      
      await new Promise(r => setTimeout(r, 800));
      
      addMessage('agent', "Here are the ingredients. You can add missing items or uncheck ones you have.", 'ingredient-selector', analysis.ingredients);
      setStep(AppStep.INGREDIENT_SELECTION);

    } catch (e) {
      console.error(e);
      addMessage('system', "An unexpected error occurred. Please try again.");
      setStep(AppStep.DEMAND_GATHERING);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIngredientsConfirmed = async (selectedIngredients: Ingredient[]) => {
    if (!userLocation) return;

    // 1. Show Final Buy List Summary
    const buyListSummary = selectedIngredients.map(i => `• ${i.name}: ${i.quantity} ${i.unit}`).join('\n');
    addMessage('agent', `Final Shopping List confirmed:\n\n${buyListSummary}`, 'text');

    setStep(AppStep.PROCESSING);
    setIsLoading(true);
    
    await new Promise(r => setTimeout(r, 800));
    addMessage('agent', "Checking availability at nearby suppliers...");

    await new Promise(r => setTimeout(r, 1000));

    sourceIngredients(selectedIngredients, userLocation);
  };

  const sourceIngredients = async (ingredients: Ingredient[], location: Coordinate) => {
    try {
      // Use shared/cached generation to match Manager Dashboard
      const allSuppliers = generateSuppliers(location);

      addMessage('agent', "Locating nearest verified supermarket (Carrefour, PX Mart, etc.)...");
      const realSupermarket = await findNearestSupermarket(location);
      
      const shipments = createSourcingPlan(location, ingredients, allSuppliers, realSupermarket || undefined);

      if (shipments.length === 0) {
        addMessage('agent', "I could not source these ingredients. Please try again.");
        setStep(AppStep.DEMAND_GATHERING); 
        return;
      }

      const totalSuppliers = shipments.length;
      const isMulti = totalSuppliers > 1;
      const introText = isMulti 
        ? `I found the items but had to split the order across ${totalSuppliers} suppliers.` 
        : `I found a single supplier with everything in stock!`;
      
      addMessage('agent', introText, 'sourcing-plan', { shipments, userLoc: location });

      onOrderUpdate(prev => ({
        ...prev,
        shipments: shipments,
        status: 'PACKAGING'
      }));

      await new Promise(r => setTimeout(r, 1000));
      
      addMessage('agent', `Dispatching orders. Track your deliveries on the map.`, 'status-card', {
        title: "Order Dispatched",
        supplier: `${totalSuppliers} Sources`,
        status: "DELIVERING", 
        deliveryStatus: "In Transit",
        eta: shipments.map(s => s.eta).join(', ')
      });

      onOrderUpdate(prev => ({ ...prev, status: 'DELIVERING' }));
      setStep(AppStep.DELIVERY);

    } catch (e) {
      console.error(e);
      addMessage('system', "Error during sourcing.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-xl overflow-hidden">
      <div className="bg-slate-800 text-white p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          MealAgent
        </h1>
        <div className="text-xs text-gray-400">v2.8 (Manager)</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 scrollbar-hide">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] md:max-w-[85%] rounded-2xl p-3 ${
              msg.sender === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : msg.sender === 'system'
                ? 'bg-gray-200 text-gray-600 text-sm'
                : 'bg-white border border-gray-200 text-gray-800 shadow-sm rounded-tl-none'
            }`}>
              
              {msg.type === 'text' && (
                <p className="whitespace-pre-line">{msg.text}</p>
              )}

              {msg.type === 'location-request' && (
                <div className="space-y-3">
                  <p>{msg.text}</p>
                  <button 
                    onClick={handleShareLocation}
                    disabled={isLoading}
                    className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Share Current Location
                  </button>
                </div>
              )}

              {msg.type === 'recipe-card' && msg.data && (
                <div className="space-y-3 w-full">
                  <div className="border-b pb-2 border-gray-100">
                    <h3 className="font-bold text-lg text-slate-800">{msg.data.recipeName}</h3>
                    <p className="text-xs text-slate-500 italic mt-1 mb-2">{msg.data.instructions}</p>
                    <div className="flex flex-col gap-2">
                      <a 
                        href={msg.data.recipeUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center justify-center text-xs text-blue-600 hover:text-blue-800 font-semibold bg-blue-50 px-2 py-2 rounded hover:bg-blue-100 transition-colors w-full"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        View Full Recipe Source
                      </a>
                      
                      {step === AppStep.INGREDIENT_SELECTION && (
                        <button 
                          onClick={handleRegenerateRecipe}
                          disabled={isLoading}
                          className="inline-flex items-center justify-center text-xs text-slate-600 hover:text-slate-800 font-semibold bg-slate-100 px-2 py-2 rounded hover:bg-slate-200 transition-colors w-full"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          Find a Different Recipe
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {msg.type === 'ingredient-selector' && msg.data && (
                <IngredientSelector 
                  initialIngredients={msg.data}
                  onConfirm={handleIngredientsConfirmed}
                  disabled={step !== AppStep.INGREDIENT_SELECTION}
                />
              )}

              {msg.type === 'sourcing-plan' && msg.data && (
                <div className="space-y-3 mt-2">
                  {msg.data.shipments.map((shipment: Shipment, idx: number) => {
                    const d = shipment.distance.toFixed(1);
                    return (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-center mb-2 border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${shipment.supplier.isVirtual ? 'bg-purple-500' : 'bg-green-500'}`}></span>
                            <span className="font-bold text-slate-800">{shipment.supplier.name}</span>
                          </div>
                          <span className="text-xs text-slate-500">{d} km</span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-500">SUPPLYING:</p>
                          {shipment.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs text-slate-700">
                              <span>{item.name}</span>
                              <span className="text-gray-500">{item.quantity} {item.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {msg.type === 'status-card' && msg.data && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 space-y-2 w-full min-w-[250px]">
                  <div className="flex items-center justify-between border-b border-green-200 pb-2">
                    <span className="font-bold text-green-800">{msg.data.title}</span>
                    <span className="text-white text-xs font-bold px-2 py-1 bg-green-500 rounded-full animate-pulse">Active</span>
                  </div>
                  <div className="space-y-1 text-sm text-green-800">
                     <div className="flex justify-between">
                       <span>Source:</span>
                       <span className="font-medium">{msg.data.supplier}</span>
                     </div>
                     <div className="flex justify-between">
                       <span>Process:</span>
                       <span className="font-medium">{msg.data.status}</span>
                     </div>
                     <div className="flex justify-between">
                       <span>ETA:</span>
                       <span className="font-bold">{msg.data.eta}</span>
                     </div>
                  </div>
                  {step === AppStep.DELIVERY && orderDetails.status !== 'CANCELLED' && orderDetails.status !== 'COMPLETED' && (
                    <button 
                      onClick={handleCancelOrder}
                      className="w-full mt-2 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold py-2 rounded transition-colors"
                    >
                      Cancel Order
                    </button>
                  )}
                  {orderDetails.status === 'COMPLETED' && (
                    <div className="w-full mt-2 bg-green-100 text-green-800 text-xs font-bold py-2 rounded text-center">
                      Order Fulfilled
                    </div>
                  )}
                </div>
              )}

              <div className="text-[10px] opacity-50 mt-1 text-right">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
            placeholder={step === AppStep.DELIVERY ? "Type 'cancel' to stop order..." : "Type your message..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            disabled={step === AppStep.LOCATION_GATHERING || step === AppStep.PROCESSING || step === AppStep.INGREDIENT_SELECTION}
          />
          <button 
            onClick={handleSendMessage}
            disabled={!input.trim() || step === AppStep.LOCATION_GATHERING || step === AppStep.PROCESSING || step === AppStep.INGREDIENT_SELECTION}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg px-4 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;