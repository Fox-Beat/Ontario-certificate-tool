import React, { useState, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import saveAs from 'file-saver'; 

import { FileUploader } from './components/FileUploader';
import { ReportTable } from './components/ReportTable';
import { ExcelDataProvider } from './components/ExcelDataProvider';
import { ProcessedFileData, ExtractedGeminiInfo, GameProviderMap, ProviderInfo } from './types';
import { extractInfoFromText, extractInfoFromImage } from './services/geminiService';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './constants';
import { PlayIcon } from './components/icons/PlayIcon';
import { KeyIcon } from './components/icons/KeyIcon';

// Set up pdf.js worker
const PDF_WORKER_SRC = `https://esm.sh/pdfjs-dist@4.5.136/build/pdf.worker.min.js`;

if (typeof Worker !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
}

const triggerDownload = (blob: Blob, fileName: string) => {
  saveAs(blob, fileName);
};

const convertFileToBase64AndGetMime = (file: File): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const parts = result.split(';');
      if (parts.length < 2 || !parts[0].startsWith('data:')) {
        reject(new Error("Invalid Data URL format"));
        return;
      }
      const mimeType = parts[0].substring(5); 
      const base64Data = parts[1].substring("base64,".length);
      resolve({ base64: base64Data, mimeType });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export const normalizeGameName = (name: string | null): string => {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s*\(copy\)/i, '') // Remove " (copy)" case-insensitively
    .replace(/\s+(94%|v94)$/i, '') // Remove specific versioning suffixes like " 94%" or " V94"
    .toLowerCase()
    .replace(/™|®|©/g, '') // Remove common symbols
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

const sanitizeFolderName = (name: string): string => {
  return name.replace(/[<>:"/\\|?*]/g, '_');
};

const parseProviderData = (text: string): GameProviderMap => {
    const lines = text.split('\n');
    const newProviderMap: GameProviderMap = new Map();
    const dataLines = lines[0] && lines[0].toLowerCase().includes('game provider') ? lines.slice(1) : lines;

    dataLines.forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 6) {
        const gameName = parts[0]?.trim();
        const providerName = parts[1]?.trim();
        const activatedInIms = parts[2]?.trim() || null;
        const portalLiveDate = parts[3]?.trim() || null;
        const imsGameCode = parts[5]?.trim() || null;
        
        if (gameName && providerName) {
          const normalizedKey = normalizeGameName(gameName);
          if (normalizedKey) {
            const info: ProviderInfo = {
                provider: providerName,
                activatedInIms,
                portalLiveDate: portalLiveDate,
                imsGameCode: imsGameCode,
            };
            newProviderMap.set(normalizedKey, info);
          }
        }
      }
    });
    return newProviderMap;
};


const App: React.FC = () => {
  const [processedFiles, setProcessedFiles] = useState<ProcessedFileData[]>([]);
  const [originalFilesMap, setOriginalFilesMap] = useState<Map<string, File>>(new Map());
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [gameProviderMap, setGameProviderMap] = useState<GameProviderMap>(new Map());
  const [providerDataText, setProviderDataText] = useState<string>('');
  const [providerDataStatus, setProviderDataStatus] = useState<string>('');


  useEffect(() => {
    // Load API key from local storage on mount
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    }
    // Note: Removed process.env check to ensure compatibility with static hosting (GitHub Pages)
    // where process might not be defined, avoiding runtime crashes.
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem('gemini_api_key', newKey);
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map(item => (item as any).str).join(' ') + '\n';
    }
    return fullText;
  };

  const handleFilesSelected = useCallback(async (files: FileList) => {
    const newInitialFilesData: ProcessedFileData[] = [];
    const newOriginalFilesMap = new Map(originalFilesMap);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = `${file.name}-${Date.now()}`;
      
      newOriginalFilesMap.set(fileId, file); 

      if (file.size > MAX_FILE_SIZE_BYTES) {
        newInitialFilesData.push({
          id: fileId,
          pdfFileName: file.name,
          reportNumber: null,
          certificationDate: null,
          supplierRegistrationNumber: null,
          extractedInstances: [],
          status: 'error',
          errorMessage: `File exceeds ${MAX_FILE_SIZE_MB}MB limit.`,
        });
        continue;
      }
      
      const isPdf = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/png') || file.type.startsWith('image/jpeg');

      if (!isPdf && !isImage) {
         newInitialFilesData.push({
          id: fileId,
          pdfFileName: file.name,
          reportNumber: null,
          certificationDate: null,
          supplierRegistrationNumber: null,
          extractedInstances: [],
          status: 'error',
          errorMessage: `Invalid file type: ${file.type}. Please upload PDF (.pdf), PNG (.png), or JPEG (.jpg) files.`,
        });
        continue;
      }

      newInitialFilesData.push({
        id: fileId,
        pdfFileName: file.name,
        reportNumber: null,
        certificationDate: null,
        supplierRegistrationNumber: null,
        extractedInstances: [],
        status: 'queued', 
      });
    }
    setOriginalFilesMap(newOriginalFilesMap);
    setProcessedFiles(prev => [...prev, ...newInitialFilesData]);
  }, [originalFilesMap]);

  const handleStartProcessing = useCallback(async () => {
    if (isBatchProcessing || isZipping) return;

    if (!apiKey) {
        alert("Please enter your Gemini API Key to proceed.");
        return;
    }

    const parsedMap = parseProviderData(providerDataText);
    if (parsedMap.size === 0) {
        setProviderDataStatus('Failed to load provider data. Please paste valid data before processing.');
        alert("Provider data is missing or invalid. Please paste data from Monday.com before processing.");
        return;
    }
    setGameProviderMap(parsedMap);
    setProviderDataStatus(`Loaded ${parsedMap.size} game provider mapping${parsedMap.size === 1 ? '' : 's'}.`);

    const filesToProcess = processedFiles.filter(f => f.status === 'queued');
    if (filesToProcess.length === 0) {
      alert("No files in the queue to process.");
      return;
    }

    setIsBatchProcessing(true);

    for (const currentFileToProcess of filesToProcess) {
        setProcessedFiles(prev => prev.map(f => f.id === currentFileToProcess.id ? { ...f, status: 'processing' } : f));
        
        try {
            const file = originalFilesMap.get(currentFileToProcess.id);
            if (!file) throw new Error("Original file not found for processing.");

            let extractedData: ExtractedGeminiInfo;
            const isPdf = file.type === 'application/pdf';
            const isImage = file.type.startsWith('image/png') || file.type.startsWith('image/jpeg');

            if (isPdf) {
                const textContent = await extractTextFromPdf(file);
                if (!textContent.trim()) {
                    throw new Error("No text content could be extracted from the PDF.");
                }
                extractedData = await extractInfoFromText(textContent, apiKey);
            } else if (isImage) {
                const { base64, mimeType } = await convertFileToBase64AndGetMime(file);
                if (!base64) {
                    throw new Error("Could not convert image to base64.");
                }
                extractedData = await extractInfoFromImage(base64, mimeType, apiKey);
            } else {
                throw new Error(`Unsupported file type for processing: ${file.type}`);
            }
            
            setProcessedFiles(prev => prev.map(f => f.id === currentFileToProcess.id ? {
              ...f,
              reportNumber: extractedData.reportNumber,
              certificationDate: extractedData.certificationDate,
              supplierRegistrationNumber: extractedData.supplierRegistrationNumber,
              extractedInstances: extractedData.gameInstances,
              status: 'completed',
            } : f));
        } catch (error: any) {
            console.error(`Error processing file ${currentFileToProcess.pdfFileName}:`, error);
            setProcessedFiles(prev => prev.map(f => f.id === currentFileToProcess.id ? {
              ...f,
              status: 'error',
              errorMessage: error.message || 'Failed to process file or extract data.',
            } : f));
        }
    }
    setIsBatchProcessing(false);
  }, [providerDataText, processedFiles, originalFilesMap, isBatchProcessing, isZipping, apiKey]);


  const handleClearAllData = useCallback(() => {
    if (isBatchProcessing || isZipping) {
        alert("Cannot clear data while processing or zipping is in progress.");
        return;
    }
    setProcessedFiles([]);
    setOriginalFilesMap(new Map());
    setProviderDataText('');
    setGameProviderMap(new Map());
    setProviderDataStatus('');
  }, [isBatchProcessing, isZipping]);

  const handleExportZip = useCallback(async () => {
    if (isZipping || isBatchProcessing || processedFiles.filter(f => f.status === 'completed').length === 0 || gameProviderMap.size === 0) {
      alert("No completed PDF/Image files to export, provider data not loaded, or processing is in progress.");
      return;
    }
    setIsZipping(true);
    setProviderDataStatus('Generating ZIP file, please wait...');

    const zip = new JSZip();
    const filesToZip = processedFiles.filter(pf => pf.status === 'completed');
    let filesAddedToZip = 0;

    for (const processedFile of filesToZip) {
      try {
        const originalFile = originalFilesMap.get(processedFile.id);
        if (!originalFile) {
            console.warn(`Original file not found for ID: ${processedFile.id}, skipping in ZIP.`);
            continue;
        }

        const processedFolders = new Set<string>();

        if (processedFile.extractedInstances && processedFile.extractedInstances.length > 0) {
            for (const instance of processedFile.extractedInstances) {
                const gameNameKey = normalizeGameName(instance.gameName);
                const providerInfo = gameProviderMap.get(gameNameKey);
                let providerName = providerInfo?.provider;

                if (!providerName) {
                    const gameCode = instance.gameCode;
                    if (gameCode) {
                        if (gameCode.endsWith('_mcg')) providerName = 'Games Global';
                        else if (gameCode.endsWith('_prg')) providerName = 'Pragmatic';
                    }
                }
                
                const folderName = sanitizeFolderName(providerName?.trim() || 'Uncategorized');
                
                if (!processedFolders.has(folderName)) {
                    const folder = zip.folder(folderName);
                    if (folder) {
                        folder.file(originalFile.name, originalFile.arrayBuffer());
                        processedFolders.add(folderName);
                    }
                }
            }
        }
        
        if (processedFolders.size === 0) {
             const uncategorizedFolder = zip.folder("Uncategorized");
             if (uncategorizedFolder) { 
                uncategorizedFolder.file(originalFile.name, originalFile.arrayBuffer());
                processedFolders.add('Uncategorized');
             }
        }
      
        if(processedFolders.size > 0) {
            filesAddedToZip++;
        }
      } catch (error) {
          console.error(`Failed to add file ${processedFile.pdfFileName} to ZIP. Skipping this file. Error:`, error);
      }
    }
    
    if (filesAddedToZip === 0) {
        setProviderDataStatus('No files could be mapped to providers or added to Uncategorized.');
        setIsZipping(false);
        return;
    }

    try {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerDownload(zipBlob, "GameCertificatesByProvider.zip");
      setProviderDataStatus(`Successfully exported ${filesAddedToZip} file(s) in ZIP.`);
    } catch (error) {
      console.error("Error generating ZIP:", error);
      setProviderDataStatus('Error generating ZIP file. See console for details.');
    } finally {
      setIsZipping(false);
    }
  }, [processedFiles, originalFilesMap, gameProviderMap, isZipping, isBatchProcessing]);

  const hasQueuedFiles = processedFiles.some(f => f.status === 'queued');
  const isProcessingLocked = isBatchProcessing || isZipping;

  const getButtonTitle = () => {
      if (isProcessingLocked) return "Processing is in progress.";
      if (!apiKey) return "Please enter API Key.";
      if (!providerDataText.trim()) return "Please paste Game Provider Data before starting.";
      if (!hasQueuedFiles) return "No files in the queue to process.";
      return "Start processing queued files";
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col items-center">
      <header className="w-full max-w-5xl mb-8 text-center">
        <img src="https://digibeat.com/wp-content/uploads/2022/06/logo-white-300x80.png" alt="Digital Beat Logo" className="mx-auto mb-4 h-20" />
        <h1 className="text-4xl font-bold text-sky-400">Ontario Certificate Tool</h1>
        <p className="mt-2 text-slate-400">Upload PDFs and game data from Monday to process</p>
      </header>

      <main className="w-full max-w-5xl space-y-8">
        <div className="w-full p-6 bg-slate-800 border border-slate-700 rounded-xl shadow-lg space-y-4">
            <div className="flex items-center gap-3">
                <KeyIcon className="w-8 h-8 text-sky-400 flex-shrink-0" />
                <div className="flex-grow">
                    <h2 className="text-xl font-semibold text-slate-100">Gemini API Key</h2>
                    <p className="text-sm text-slate-400">
                        Enter your Google Gemini API key. 
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 ml-1">Get one here</a>.
                    </p>
                </div>
            </div>
            <input
                type="password"
                value={apiKey}
                onChange={handleApiKeyChange}
                placeholder="Enter your API Key (starts with AIza...)"
                className="w-full p-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all"
                aria-label="Enter Gemini API Key"
            />
             <p className="text-xs text-slate-500">Key is stored locally in your browser and never sent to any other server.</p>
        </div>

        <ExcelDataProvider 
          providerDataText={providerDataText} 
          onProviderDataTextChange={setProviderDataText} 
          currentStatus={providerDataStatus} 
        />
        <FileUploader onFilesSelected={handleFilesSelected} isProcessing={isBatchProcessing || isZipping} />
        {processedFiles.length > 0 && (
              <div className="flex justify-center mt-4">
                <button
                    onClick={handleStartProcessing}
                    disabled={!hasQueuedFiles || !providerDataText.trim() || isProcessingLocked || !apiKey}
                    className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-md
                                flex items-center justify-center transition-all duration-150 ease-in-out
                                focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-75
                                disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Start processing queued files"
                    title={getButtonTitle()}
                >
                    <PlayIcon className="w-5 h-5 mr-2" /> 
                    {isBatchProcessing ? 'Processing...' : `Start Processing Queued Files (${processedFiles.filter(f => f.status === 'queued').length})`}
                </button>
              </div>
        )}
        {processedFiles.length > 0 && (
          <ReportTable 
            data={processedFiles} 
            gameProviderMap={gameProviderMap}
            onClearAllData={handleClearAllData} 
            onExportZip={handleExportZip}
            isZipping={isZipping}
            isBatchProcessing={isBatchProcessing}
            canExport={processedFiles.some(f => f.status === 'completed') && gameProviderMap.size > 0 && !isBatchProcessing}
          />
        )}
      </main>

      <footer className="w-full max-w-5xl mt-12 pt-6 border-t border-slate-700 text-center text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Ontario Certificate Tool. Created by Bob Fox. Powered by Gemini.</p>
      </footer>
    </div>
  );
};

export default App;