import { GoogleGenAI } from "@google/genai";
import { RecipeAnalysis, Coordinate } from '../types';

let genAI: GoogleGenAI | null = null;

export const initializeGemini = (apiKey: string) => {
  genAI = new GoogleGenAI({ apiKey });
};

export const parseMealRequest = async (
  mealDescription: string, 
  headcount: number,
  inventoryKeys: string[],
  isVariation: boolean = false
): Promise<RecipeAnalysis | null> => {
  if (!genAI) throw new Error("Gemini AI not initialized");

  const variationPrompt = isVariation ? "Find a DIFFERENT or unique variation of this recipe." : "";

  const prompt = `
    You are a professional chef and logistics agent.
    
    Task: Search for a real recipe for "${mealDescription}" suitable for ${headcount} people.
    ${variationPrompt}
    
    Extract the details and return a valid JSON object with the following structure:
    {
      "recipeName": "Exact name of the recipe found",
      "recipeUrl": "", 
      "instructions": "Short summary of cooking instructions (max 2 sentences)",
      "ingredients": [
        { "name": "Ingredient Name", "quantity": number, "unit": "unit" }
      ]
    }

    Important Rules:
    1. Leave "recipeUrl" EMPTY unless you are 100% sure it is a valid URL from the search tool results.
    2. Normalize ingredient names to roughly match this list where possible: ${inventoryKeys.join(', ')}.
    3. **RETAIL UNIT CONVERSION**: You are generating a SHOPPING LIST, not a cooking list.
       - Convert all cooking quantities (cloves, cups, tablespoons, pinches) into whole purchasable retail units.
       - Example: "3 cloves garlic" -> { "name": "Garlic", "quantity": 1, "unit": "unit" }
       - Example: "2 tbsp Soy Sauce" -> { "name": "Soy Sauce", "quantity": 1, "unit": "bottle" }
       - Example: "500g Beef" -> { "name": "Beef", "quantity": 1, "unit": "pack" } (or keep g/kg if standard)
       - Always round UP to the nearest whole purchasable unit (e.g. 1 head, 1 bag, 1 box).
    4. Return ONLY the JSON object. Do not include markdown formatting.
  `;

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    let text = response.text;
    if (!text) return null;

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      text = text.substring(firstBrace, lastBrace + 1);
    } else {
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    
    let data: RecipeAnalysis;
    try {
        data = JSON.parse(text) as RecipeAnalysis;
    } catch (e) {
        console.error("Failed to parse JSON from Gemini response:", text);
        return null;
    }
    
    // STRICT URL LOGIC: Prioritize Grounding Metadata
    let foundRealUrl = false;
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        const chunk = response.candidates[0].groundingMetadata.groundingChunks.find((c: any) => c.web?.uri);
        if (chunk && chunk.web?.uri) {
            data.recipeUrl = chunk.web.uri;
            foundRealUrl = true;
        }
    }

    // Fallback: If no real URL found from grounding, construct a safe Google Search URL
    if (!foundRealUrl || !data.recipeUrl || !data.recipeUrl.startsWith('http')) {
        data.recipeUrl = `https://www.google.com/search?q=${encodeURIComponent(data.recipeName + " recipe")}`;
    }

    return data;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return null;
  }
};

export const findNearestSupermarket = async (location: Coordinate): Promise<{name: string, location: Coordinate} | null> => {
  if (!genAI) return null;

  // Updated prompt to search for specific Taiwanese chains
  const prompt = `
    Find the nearest supermarket matching one of these brands: "家樂福" (Carrefour), "全聯" (PX Mart), "頂好" (Wellcome), or "美聯社" (Simple Mart) near latitude ${location.lat}, longitude ${location.lng}.
    
    Return a JSON object with:
    {
      "name": "Name of the store found",
      "lat": number,
      "lng": number
    }
    Ensure the coordinates are precise.
  `;

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
      }
    });

    let text = response.text;
    if (text) {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
         try {
           const json = JSON.parse(text.substring(firstBrace, lastBrace + 1));
           if (json.name && json.lat && json.lng) {
             return { name: json.name, location: { lat: json.lat, lng: json.lng } };
           }
         } catch (e) {
           // ignore parse error
         }
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to find real supermarket:", error);
    return null;
  }
};