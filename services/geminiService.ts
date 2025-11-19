
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ExtractedGeminiInfo, GameInstanceData, FileDetail } from '../types';
import { GEMINI_MODEL_NAME, GENAI_SYSTEM_INSTRUCTION, IMAGE_EXTRACTION_SYSTEM_INSTRUCTION, IMAGE_EXTRACTION_PROMPT_FOR_CONTENTS } from '../constants';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function validateAndStructureData(parsedData: any, rawResponseText: string): ExtractedGeminiInfo {
    // Basic structure validation
    if (typeof parsedData.reportNumber === 'undefined' || // reportNumber can be null
        typeof parsedData.certificationDate === 'undefined' || // certificationDate can be null
        typeof parsedData.supplierRegistrationNumber === 'undefined' || // supplierRegistrationNumber can be null
        !Array.isArray(parsedData.gameInstances)) {
        console.error("Parsed JSON structure error: missing key fields or gameInstances array. Raw:", rawResponseText.substring(0,500));
        throw new Error('Parsed JSON does not match expected structure (missing reportNumber, certificationDate, supplierRegistrationNumber, or gameInstances array).');
    }
    
    // Validate structure of items within gameInstances array
    if (parsedData.gameInstances) {
      for (const instance of parsedData.gameInstances as Array<Partial<GameInstanceData>>) {
        if (typeof instance.gameName === 'undefined' || // gameName can be null
            typeof instance.gameCode === 'undefined' || // gameCode can be null
            !Array.isArray(instance.files)) {
          console.error("Parsed JSON game instance error: missing gameName, gameCode, or files array. Instance:", instance, "Raw:", rawResponseText.substring(0,500));
          throw new Error('Parsed JSON for a game instance is invalid (missing gameName, gameCode, or files array).');
        }
        if (instance.files) {
          for (const file of instance.files as Array<Partial<FileDetail>>) {
            if (typeof file.name !== 'string' ) { // md5 and sha1 can be null or undefined
               console.error("Parsed JSON file entry error: missing name. File:", file, "Raw:", rawResponseText.substring(0,500));
               throw new Error('Parsed JSON for a file entry is invalid (missing name).');
            }
          }
        }
      }
    }

    // Ensure all required fields are present, defaulting to null or empty arrays
    const validatedData: ExtractedGeminiInfo = {
      reportNumber: parsedData.reportNumber ?? null,
      certificationDate: parsedData.certificationDate ?? null,
      supplierRegistrationNumber: parsedData.supplierRegistrationNumber ?? null,
      gameInstances: (parsedData.gameInstances || []).map((instance: Partial<GameInstanceData>) => ({
          gameName: instance.gameName ?? null,
          gameCode: instance.gameCode ?? null,
          files: (instance.files || []).map((f: Partial<FileDetail>) => ({
              name: f.name!, // Name is validated to be string above
              md5: f.md5 === undefined ? null : f.md5, 
              sha1: f.sha1 === undefined ? null : f.sha1 
          }))
      }))
    };
    return validatedData;
}


export async function extractInfoFromText(ocrText: string, apiKey: string): Promise<ExtractedGeminiInfo> {
  if (!apiKey) {
    throw new Error("Gemini API Key is missing.");
  }
  const ai = new GoogleGenAI({ apiKey });

  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [{ role: "user", parts: [{text: ocrText}] }],
        config: {
          systemInstruction: GENAI_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 } 
        },
      });

      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }

      try {
        const parsedData = JSON.parse(jsonStr);
        return validateAndStructureData(parsedData, response.text);
      } catch (e: any) {
        console.error(`Attempt ${attempt}: Failed to parse or validate JSON response from Gemini (text extraction):`, e);
        console.error(`Attempt ${attempt}: Original Gemini text response:`, response.text);
        // This is a data parsing error, not a network error for retry, so throw immediately
        throw new Error(`Failed to parse/validate JSON from AI (text). Raw: ${response.text.substring(0,1000)}. Err: ${e.message}`);
      }

    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt} calling Gemini API (text extraction):`, error);
      
      const errorMessage = String(error.message || '');
      // Only retry on specific "500 UNKNOWN" XHR errors.
      if (errorMessage.includes("status: 500 UNKNOWN") && attempt < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY_MS}ms... (${attempt}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue; 
      }
      if (errorMessage.includes("API key not valid")) {
          throw new Error("Invalid Gemini API Key. Please check your configuration.");
      }
      // For other errors or if max retries reached, throw the last error.
      throw new Error(`Failed to get data from AI (text) after ${attempt} attempt(s): ${errorMessage}`);
    }
  }
  // Should not be reached if logic is correct, but as a fallback:
  throw lastError || new Error(`Failed to extract info from text after ${MAX_RETRIES} attempts.`);
}

export async function extractInfoFromImage(imageBase64: string, mimeType: string, apiKey: string): Promise<ExtractedGeminiInfo> {
  if (!apiKey) {
    throw new Error("Gemini API Key is missing.");
  }
  const ai = new GoogleGenAI({ apiKey });

  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const imagePart = { inlineData: { mimeType, data: imageBase64 } };
      const textPart = { text: IMAGE_EXTRACTION_PROMPT_FOR_CONTENTS };

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: { parts: [imagePart, textPart] },
        config: {
          systemInstruction: IMAGE_EXTRACTION_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 }
        },
      });

      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }
      
      try {
        const parsedData = JSON.parse(jsonStr);
        return validateAndStructureData(parsedData, response.text);
      } catch (e: any) {
        console.error(`Attempt ${attempt}: Failed to parse or validate JSON response from Gemini (image extraction):`, e);
        console.error(`Attempt ${attempt}: Original Gemini image response text:`, response.text);
        // This is a data parsing error, not a network error for retry, so throw immediately
        throw new Error(`Failed to parse/validate JSON from AI (image). Raw: ${response.text.substring(0,1000)}. Err: ${e.message}`);
      }

    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt} calling Gemini API (image extraction):`, error);
      
      const errorMessage = String(error.message || '');
      // Only retry on specific "500 UNKNOWN" XHR errors.
      if (errorMessage.includes("status: 500 UNKNOWN") && attempt < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY_MS}ms... (${attempt}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      if (errorMessage.includes("API key not valid")) {
        throw new Error("Invalid Gemini API Key. Please check your configuration.");
      }
      // For other errors or if max retries reached, throw the last error.
      throw new Error(`Failed to get data from AI (image) after ${attempt} attempt(s): ${errorMessage}`);
    }
  }
  // Should not be reached if logic is correct, but as a fallback:
  throw lastError || new Error(`Failed to extract info from image after ${MAX_RETRIES} attempts.`);
}
