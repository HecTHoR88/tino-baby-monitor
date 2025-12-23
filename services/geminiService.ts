import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResult } from "../types";

/**
 * Analiza un fotograma enviado por la cámara utilizando Google Gemini IA.
 * Sigue estrictamente las guías de ingeniería de Google GenAI SDK.
 */
export const analyzeBabyFrame = async (base64Image: string): Promise<AIAnalysisResult> => {
  try {
    // 1. Inicialización de la IA justo antes de la llamada (Garantiza uso de la última API KEY)
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Limpieza de prefijo base64 si existe
    const data = base64Image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    // 2. Generación de contenido con modelo gemini-3-flash-preview (recomendado para tareas de análisis)
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: data
            }
          },
          {
            text: "Eres un monitor de bebés experto. Analiza la imagen y clasifica el estado: 'sleeping' (durmiendo), 'awake' (despierto/movimiento), o 'crying' (llorando). Responde únicamente en formato JSON con los campos: status, safetyScore (0-100) y description (resumen breve)."
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
                enum: ['sleeping', 'awake', 'crying', 'not_detected', 'unknown'] 
            },
            safetyScore: { type: Type.INTEGER },
            description: { type: Type.STRING }
          },
          required: ['status', 'safetyScore', 'description']
        }
      }
    });

    // 3. Extracción de texto usando la propiedad .text (no método)
    const textOutput = response.text;
    if (textOutput) {
      const result = JSON.parse(textOutput);
      return { 
        ...result, 
        timestamp: Date.now() 
      };
    }
    
    throw new Error("Respuesta de IA vacía");
  } catch (error) {
    console.error("Error en análisis Gemini:", error);
    return { 
        status: 'unknown', 
        safetyScore: 0, 
        description: "Error de conexión con el servicio de IA", 
        timestamp: Date.now() 
    };
  }
};
