import { Supplier, Coordinate, Ingredient, Shipment } from '../types';

// 1. Define Mandatory Items (Must exist in every supplier)
const MANDATORY_ITEMS = [
  'Beef', 'Pork', 'Chicken', 'Rice', 'Fish', 
  'Eggplant', 'Vegetables', 'Potato', 'Tomato', 
  'Chili', 'Green Pepper', 'Onion', 
  'Noodles', 'Flour', 'Pasta Noodles'
];

// 2. Define Random Additional Goods
const RANDOM_ITEMS = [
  'Spinach', 'Lettuce', 'Kale', 'Garlic', 'Leek',
  'Apple', 'Banana', 'Citrus', 'Mushrooms',
  'Ground Beef', 'Steak', 'Salmon', 'Eggs', 'Tofu',
  'Sugar', 'Salt', 'Vegetable Oil', 'Olive Oil', 
  'Soy Sauce', 'Vinegar', 'Pepper', 'Milk', 'Cheese', 'Butter'
];

// Specific Taiwanese Supermarkets
const SUPPLIER_NAMES = [
  '家樂福 (Carrefour)', 
  '全聯福利中心 (PX Mart)', 
  '頂好 (Wellcome)', 
  '美聯社 (Simple Mart)'
];

// Singleton Cache to ensure Manager Dashboard sees the same data as the Chat
let cachedSuppliers: Supplier[] = [];
let cachedCenter: Coordinate | null = null;

// Helper to generate random coordinates near a center point (approx 15km radius)
const generateRandomCoord = (center: Coordinate): Coordinate => {
  const r = 15 / 111.32; // ~15km in degrees
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const x = w * Math.cos(t);
  const y = w * Math.sin(t);
  return {
    lat: center.lat + x,
    lng: center.lng + y
  };
};

export const clearSupplierCache = () => {
  cachedSuppliers = [];
  cachedCenter = null;
};

// Accessor for the Dashboard
export const getActiveSuppliers = (): Supplier[] => {
  return cachedSuppliers;
};

// Generate 30 mock suppliers with STRICT mandatory inventory
export const generateSuppliers = (center: Coordinate): Supplier[] => {
  // If we already have suppliers generated near this location, return them to ensure consistency
  if (cachedSuppliers.length > 0 && cachedCenter) {
    const dist = getDistance(center, cachedCenter);
    if (dist < 2.0) { // If user hasn't moved significantly (>2km), reuse data
      return cachedSuppliers;
    }
  }

  const suppliers: Supplier[] = [];
  
  for (let i = 0; i < 30; i++) {
    const name = SUPPLIER_NAMES[Math.floor(Math.random() * SUPPLIER_NAMES.length)];
    const branchId = Math.floor(Math.random() * 900) + 100;
    
    const inventory: Record<string, number> = {};

    // 1. Populate Mandatory Items (Always > 0)
    MANDATORY_ITEMS.forEach(item => {
      // Random quantity between 50 and 500
      inventory[item.toLowerCase()] = Math.floor(Math.random() * 450) + 50; 
    });

    // 2. Populate Random Items (Can be 0)
    RANDOM_ITEMS.forEach(item => {
      if (Math.random() < 0.7) { // 70% chance to have it
        inventory[item.toLowerCase()] = Math.floor(Math.random() * 200) + 10;
      } else {
        inventory[item.toLowerCase()] = 0;
      }
    });

    suppliers.push({
      id: `sup-${i}`,
      name: `${name} #${branchId}`,
      location: generateRandomCoord(center),
      inventory: inventory
    });
  }

  cachedSuppliers = suppliers;
  cachedCenter = center;
  return suppliers;
};

export const getDistance = (loc1: Coordinate, loc2: Coordinate): number => {
  return Math.sqrt(
    Math.pow(loc2.lat - loc1.lat, 2) + 
    Math.pow(loc2.lng - loc1.lng, 2)
  ) * 111.32; // Approx km
};

const hasIngredient = (supplier: Supplier, req: Ingredient): boolean => {
  const key = req.name.toLowerCase();
  // Simple substring match for mock purposes
  const inventoryKey = Object.keys(supplier.inventory).find(k => key.includes(k) || k.includes(key));
  
  if (!inventoryKey || supplier.inventory[inventoryKey] <= 0) return false; 
  return supplier.inventory[inventoryKey] >= req.quantity;
};

const createVirtualSupplier = (userLoc: Coordinate, items: Ingredient[], realFallback?: {name: string, location: Coordinate}): Supplier => {
  let location: Coordinate;
  let name: string;

  if (realFallback) {
    location = realFallback.location;
    name = `${realFallback.name}`;
  } else {
    const angle = Math.random() * Math.PI * 2;
    const distance = 0.05 + (Math.random() * 0.05); 
    location = {
      lat: userLoc.lat + (Math.cos(angle) * distance),
      lng: userLoc.lng + (Math.sin(angle) * distance)
    };
    name = '家樂福 Carrefour (Virtual Hub)';
  }
  
  const inventory: Record<string, number> = {};
  items.forEach(i => inventory[i.name.toLowerCase()] = 10000); 

  return {
    id: `virtual-${Date.now()}`,
    name: name,
    location: location,
    inventory: inventory,
    isVirtual: true
  };
};

const calculateTiming = (distanceKm: number): { eta: string, travelTime: number } => {
  const baseMinutesPerKm = 2.2;
  const trafficFactor = 1.0 + (Math.random() * 0.3);
  const travelTime = Math.ceil(distanceKm * baseMinutesPerKm * trafficFactor);
  const prepTime = Math.floor(Math.random() * 5) + 10; 
  
  return {
    eta: `${travelTime + prepTime} mins`,
    travelTime: travelTime
  };
};

export const createSourcingPlan = (
  userLoc: Coordinate,
  requiredIngredients: Ingredient[],
  allSuppliers: Supplier[],
  realFallback?: {name: string, location: Coordinate}
): Shipment[] => {
  
  const perfectSuppliers = allSuppliers.filter(s => 
    requiredIngredients.every(req => hasIngredient(s, req))
  );

  if (perfectSuppliers.length > 0) {
    perfectSuppliers.sort((a, b) => getDistance(userLoc, a.location) - getDistance(userLoc, b.location));
    const best = perfectSuppliers[0];
    const dist = getDistance(userLoc, best.location);
    const timing = calculateTiming(dist);
    return [{
      supplier: best,
      items: requiredIngredients,
      distance: dist,
      eta: timing.eta,
      travelTime: timing.travelTime
    }];
  }

  const scoredSuppliers = allSuppliers.map(s => {
    const matched = requiredIngredients.filter(req => hasIngredient(s, req));
    return {
      supplier: s,
      matched,
      missing: requiredIngredients.filter(req => !hasIngredient(s, req)),
      matchCount: matched.length,
      distance: getDistance(userLoc, s.location)
    };
  });

  scoredSuppliers.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return a.distance - b.distance;
  });

  const bestOption = scoredSuppliers[0];

  if (bestOption.matchCount === 0) {
     const virtual = createVirtualSupplier(userLoc, requiredIngredients, realFallback);
     const dist = getDistance(userLoc, virtual.location);
     const timing = calculateTiming(dist);
     return [{
       supplier: virtual,
       items: requiredIngredients,
       distance: dist,
       eta: timing.eta,
       travelTime: timing.travelTime
     }];
  }

  const plan: Shipment[] = [];

  const dist1 = getDistance(userLoc, bestOption.supplier.location);
  const timing1 = calculateTiming(dist1);
  plan.push({
    supplier: bestOption.supplier,
    items: bestOption.matched,
    distance: dist1,
    eta: timing1.eta,
    travelTime: timing1.travelTime
  });

  if (bestOption.missing.length > 0) {
    const virtualSupplier = createVirtualSupplier(userLoc, bestOption.missing, realFallback);
    const dist2 = getDistance(userLoc, virtualSupplier.location);
    const timing2 = calculateTiming(dist2);
    plan.push({
      supplier: virtualSupplier,
      items: bestOption.missing,
      distance: dist2,
      eta: timing2.eta,
      travelTime: timing2.travelTime
    });
  }

  return plan;
};

export const getInventoryKeys = (): string[] => [...MANDATORY_ITEMS, ...RANDOM_ITEMS];