
export interface FileDetail {
  name: string;
  md5: string | null;
  sha1: string | null;
}

export interface GameInstanceData {
  gameName: string | null;
  gameCode: string | null; // This is the IMS code extracted by Gemini
  files: FileDetail[];
}

export interface ExtractedGeminiInfo {
  reportNumber: string | null;
  certificationDate: string | null; 
  supplierRegistrationNumber: string | null;
  gameInstances: GameInstanceData[];
}

export interface ProcessedFileData {
  id: string;
  pdfFileName: string; 
  originalFile?: File; 
  status: 'pending' | 'processing' | 'completed' | 'error' | 'queued'; 
  errorMessage?: string;
  reportNumber: string | null; 
  certificationDate: string | null; 
  supplierRegistrationNumber: string | null; 
  extractedInstances: GameInstanceData[]; 
}

// For grounding metadata from Google Search
export interface GroundingChunkWeb {
  uri: string;
  title: string;
}

export interface GroundingChunk {
  web?: GroundingChunkWeb;
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
}

export interface Candidate {
  groundingMetadata?: GroundingMetadata;
}

// New structure for holding detailed provider info from Monday.com export
export interface ProviderInfo {
  provider: string;
  activatedInIms: string | null;
  portalLiveDate: string | null;
  imsGameCode: string | null;
}

// The map now holds a string (normalized game name) to the detailed ProviderInfo object.
export type GameProviderMap = Map<string, ProviderInfo>;