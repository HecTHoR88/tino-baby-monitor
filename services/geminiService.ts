import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeBabyFrame = async (base64Image: string): Promise<AIAnalysisResult> => {
  try {
    // Clean base64 string if it contains the header
    const data = base64Image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png', // Assuming canvas toDataURL defaults to png
              data: data
            }
          },
          {
            text: "Analyze this image from a baby monitor. Classify the baby's status strictly as 'sleeping', 'awake' (if eyes open or moving), or 'crying' (if mouth open/distress). Return a JSON object."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: {
              type: Type.STRING,
              enum: ['sleeping', 'awake', 'crying', 'not_detected', 'unknown'],
              description: "The current state of the baby."
            },
            safetyScore: {
              type: Type.INTEGER,
              description: "A score from 0 to 100 indicating how safe the situation looks (100 being very safe)."
            },
            description: {
              type: Type.STRING,
              description: "A very brief, 1-sentence description of what is seen (e.g., 'Baby is crying')."
            }
          },
          required: ['status', 'safetyScore', 'description']
        }
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      return {
        ...result,
        timestamp: Date.now()
      };
    }
    
    throw new Error("No text in response");

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      status: 'unknown',
      safetyScore: 0,
      description: "No se pudo analizar la imagen.",
      timestamp: Date.now()
    };
  }
};