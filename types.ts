export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Supplier {
  id: string;
  name: string;
  location: Coordinate;
  inventory: Record<string, number>; // Specific inventory for this supplier
  isVirtual?: boolean; // Flag to indicate if this is a generated virtual supplier
}

export interface RecipeAnalysis {
  recipeName: string;
  recipeUrl: string; // URL to the recipe
  instructions: string;
  ingredients: Ingredient[];
}

export interface Shipment {
  supplier: Supplier;
  items: Ingredient[];
  eta: string;
  distance: number; // Distance in km
  travelTime: number; // Estimated driving time in minutes
}

export interface OrderDetails {
  meal: string;
  headcount: number;
  recipe?: RecipeAnalysis;
  shipments: Shipment[]; // Replaces single supplier with list of shipments
  status: 'PENDING' | 'ANALYZING' | 'SOURCING' | 'PACKAGING' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: Date;
  type?: 'text' | 'location-request' | 'status-card' | 'recipe-card' | 'supplier-list' | 'sourcing-plan' | 'map-key-request' | 'ingredient-selector';
  data?: any;
}

export enum AppStep {
  INIT,
  DEMAND_GATHERING,
  LOCATION_GATHERING,
  INGREDIENT_SELECTION,
  PROCESSING,
  DELIVERY
}