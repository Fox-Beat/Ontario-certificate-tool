
import React, { useState, useCallback } from 'react';
import { ProcessedFileData, GameInstanceData, FileDetail, GameProviderMap } from '../types';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { CheckIcon } from './icons/CheckIcon';
import { LoadingSpinner } from './LoadingSpinner';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { TrashIcon } from './icons/TrashIcon'; 
import { DownloadIcon } from './icons/DownloadIcon'; 
import { DocumentDuplicateIcon } from './icons/DocumentDuplicateIcon';
import { normalizeGameName } from '../App';

interface ReportTableProps {
  data: ProcessedFileData[];
  gameProviderMap: GameProviderMap;
  onClearAllData: () => void;
  onExportZip: () => void;
  isZipping: boolean;
  isBatchProcessing: boolean;
  canExport: boolean;
}

const cleanGameNameForDisplay = (name: string | null): string => {
    if (!name) return '';
    return name
        .trim()
        .replace(/\s*\(copy\)/i, '')
        .replace(/\s+(94%|v94)$/i, '')
        .replace(/™|®|©/g, '')
        .replace(/\s+/g, ' ')
        .trim() || '';
};

const getDisplayHash = (file: FileDetail): string => {
  if (file.md5) return file.md5;
  if (file.sha1) return file.sha1;
  return '';
};

const formatDateToYyyyMmDd = (dateString: string | null): string => {
  if (!dateString) {
    return '';
  }

  const trimmedDateString = dateString.trim();

  // Case 1: Input is already YYYY-MM-DD. Validate and return.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDateString)) {
    const date = new Date(trimmedDateString);
    if (!isNaN(date.getTime())) {
      return trimmedDateString;
    }
  }

  // Case 2: Input is DD/MM/YYYY or DD-MM-YYYY. This is the priority.
  const parts = trimmedDateString.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10);
    const year = parseInt(parts[3], 10);
    
    // Basic validation for sensible dates
    if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Month in JS Date is 0-indexed, so subtract 1
      const date = new Date(Date.UTC(year, month - 1, day));
      // Final check to ensure date is valid (e.g. not Feb 30, which JS would roll over)
      // and that the parsed day matches the input day.
      if (!isNaN(date.getTime()) && date.getUTCDate() === day) {
        return date.toISOString().split('T')[0];
      }
    }
  }

  // Case 3: Fallback for other formats that new Date() can handle (e.g., MM/DD/YYYY, "Jan 1 2024")
  try {
    const date = new Date(trimmedDateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    // Ignore errors here, we'll handle failure below
  }
  
  console.warn(`Could not parse date: "${trimmedDateString}". Returning empty string.`);
  return '';
};


export const ReportTable: React.FC<ReportTableProps> = ({ data, gameProviderMap, onClearAllData, onExportZip, isZipping, isBatchProcessing, canExport }) => {
  const [copied, setCopied] = useState(false);
  const [comCopied, setComCopied] = useState(false);

  const copyToClipboard = useCallback(() => {
    const headers = "GameName\tGameCodes\tProgressive\tCertificateRef\tActivated in IMS\tPortal live date\tSupplierRegistrationnumber\tDeactivated\tFileList\tHashList";
    
    const formatListForClipboard = (items: (string | null)[]) => {
      if (!items || items.length === 0) return '';
      const content = items.filter(Boolean).join(', ');
      if (!content) return '';
      const escapedContent = content.replace(/"/g, '""');
      return `"${escapedContent}"`;
    };

    const authoritativeImsCodeMap = new Map<string, string>();
    for (const [gameNameKey, providerInfo] of gameProviderMap.entries()) {
        if (providerInfo.imsGameCode) {
            authoritativeImsCodeMap.set(gameNameKey, providerInfo.imsGameCode);
        }
    }

    const tableRows: string[] = [];
    data.forEach(fileEntry => {
      if (fileEntry.status !== 'completed') return;

      if (fileEntry.extractedInstances.length > 0) {
        fileEntry.extractedInstances.forEach(instance => {
          const cleanedGameName = cleanGameNameForDisplay(instance.gameName);
          const gameNameKey = normalizeGameName(instance.gameName);
          
          const gameCodes = authoritativeImsCodeMap.get(gameNameKey) || '';
          
          const providerInfo = gameProviderMap.get(gameNameKey);
          const portalDate = formatDateToYyyyMmDd(providerInfo?.portalLiveDate || null);

          const row = [
            cleanedGameName,
            gameCodes,
            "", // Progressive
            fileEntry.reportNumber || '',
            providerInfo?.activatedInIms || '',
            portalDate,
            "", // SupplierRegistrationnumber
            "", // Deactivated
            formatListForClipboard(instance.files.map(f => f.name)),
            formatListForClipboard(instance.files.map(f => getDisplayHash(f)))
          ].join('\t');
          tableRows.push(row);
        });
      } else {
        const row = [
          '', '', "", fileEntry.reportNumber || '',
          '', '', "", "", '', ''
        ].join('\t');
        tableRows.push(row);
      }
    });
    
    const rows = tableRows.join('\n');
    if (!rows.trim()) {
        alert("No completed data available to copy.");
        return;
    }
    const tsvData = `${headers}\n${rows}`;
    navigator.clipboard.writeText(tsvData).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy table data:', err);
      alert('Failed to copy table data. See console for details.');
    });
  }, [data, gameProviderMap]);

  const copyForComProcess = useCallback(() => {
    const headers = "Game Name\tIMS Game Code\tCertificate Number\tActivated in IMS\tPortal Live Date";
    
    const authoritativeImsCodeMap = new Map<string, string>();
    for (const [gameNameKey, providerInfo] of gameProviderMap.entries()) {
        if (providerInfo.imsGameCode) {
            authoritativeImsCodeMap.set(gameNameKey, providerInfo.imsGameCode);
        }
    }

    interface ComDataRow {
        gameName: string;
        gameCode: string;
        certificateRef: string;
        activatedInIms: string;
        date: string;
        provider: string;
    }
    const comDataRows: ComDataRow[] = [];

    data.forEach(fileEntry => {
        if (fileEntry.status !== 'completed') return;

        const instances = fileEntry.extractedInstances.length > 0 ? fileEntry.extractedInstances : [{ gameName: null, gameCode: null, files: [] }];

        instances.forEach(instance => {
            const gameNameKey = normalizeGameName(instance.gameName);
            const providerInfo = gameProviderMap.get(gameNameKey);

            comDataRows.push({
                gameName: cleanGameNameForDisplay(instance.gameName),
                gameCode: authoritativeImsCodeMap.get(gameNameKey) || '',
                certificateRef: fileEntry.reportNumber || '',
                activatedInIms: providerInfo?.activatedInIms || '',
                date: formatDateToYyyyMmDd(providerInfo?.portalLiveDate || null),
                provider: providerInfo?.provider || 'ZZZ_Uncategorized',
            });
        });
    });

    if (comDataRows.length === 0) {
        alert("No completed data available for .COM process export.");
        return;
    }

    comDataRows.sort((a, b) => {
        if (a.provider < b.provider) return -1;
        if (a.provider > b.provider) return 1;
        if (a.gameName < b.gameName) return -1;
        if (a.gameName > b.gameName) return 1;
        return 0;
    });

    const tableRows = comDataRows.map(row => 
        [
            row.gameName,
            row.gameCode,
            row.certificateRef,
            row.activatedInIms,
            row.date
        ].join('\t')
    );
    
    const tsvData = `${headers}\n${tableRows.join('\n')}`;
    navigator.clipboard.writeText(tsvData).then(() => {
      setComCopied(true);
      setTimeout(() => setComCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy .COM process data:', err);
      alert('Failed to copy .COM process data. See console for details.');
    });
  }, [data, gameProviderMap]);


  if (data.length === 0) {
    return null; 
  }
  
  const hasCompletedData = data.some(f => f.status === 'completed');

  return (
    <div className="w-full bg-slate-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 sm:p-6 flex flex-wrap justify-between items-center border-b border-slate-700 gap-2">
        <h2 className="text-xl font-semibold text-slate-100">Extracted Report Data</h2>
        <div className="flex flex-wrap gap-2">
           <button
            onClick={copyForComProcess}
            disabled={!hasCompletedData || isZipping || isBatchProcessing}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all duration-150 ease-in-out
                        ${comCopied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}
                        text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-50
                        disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {comCopied ? (
              <CheckIcon className="w-5 h-5 mr-2" />
            ) : (
              <DocumentDuplicateIcon className="w-5 h-5 mr-2" />
            )}
            {comCopied ? 'Copied .COM!' : 'Copy .COM Data (TSV)'}
          </button>
          <button
            onClick={copyToClipboard}
            disabled={!hasCompletedData || isZipping || isBatchProcessing}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all duration-150 ease-in-out
                        ${copied ? 'bg-green-600 hover:bg-green-700' : 'bg-sky-600 hover:bg-sky-700'}
                        text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50
                        disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {copied ? (
              <CheckIcon className="w-5 h-5 mr-2" />
            ) : (
              <ClipboardIcon className="w-5 h-5 mr-2" />
            )}
            {copied ? 'Copied Full!' : 'Copy Full Table (TSV)'}
          </button>
          <button
            onClick={onExportZip}
            disabled={!canExport || isZipping || isBatchProcessing} 
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all duration-150 ease-in-out
                        bg-purple-600 hover:bg-purple-700 text-white
                        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50
                        disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label="Export PDFs by Provider as ZIP"
          >
            {isZipping ? <LoadingSpinner className="w-5 h-5 mr-2"/> : <DownloadIcon className="w-5 h-5 mr-2" />}
            {isZipping ? 'Zipping...' : 'Export ZIP'}
          </button>
          <button
            onClick={onClearAllData}
            disabled={data.length === 0 || isZipping || isBatchProcessing}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all duration-150 ease-in-out
                        bg-red-600 hover:bg-red-700 text-white 
                        focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50
                        disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label="Clear all data"
          >
            <TrashIcon className="w-5 h-5 mr-2" /> 
            Clear Data
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-700">
          <thead className="bg-slate-700/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">File Name (PDF/Img)</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Game Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Game Provider</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Report Number</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">File/Directory Names</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Hash</th>
            </tr>
          </thead>
          <tbody className="bg-slate-800 divide-y divide-slate-700">
            {data.map((fileEntry) => {
              if (fileEntry.extractedInstances.length > 0 && (fileEntry.status === 'completed' || fileEntry.status === 'processing' || fileEntry.status === 'queued' || fileEntry.status === 'error')) {
                return fileEntry.extractedInstances.map((instance, instanceIndex) => {
                  const providerInfo = gameProviderMap.get(normalizeGameName(instance.gameName));
                  return (
                    <tr key={`${fileEntry.id}-${instanceIndex}`} className="hover:bg-slate-700/30 transition-colors duration-150">
                      {instanceIndex === 0 && ( 
                        <>
                          <td rowSpan={fileEntry.extractedInstances.length} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200 align-top">{fileEntry.pdfFileName}</td>
                          <td rowSpan={fileEntry.extractedInstances.length} className="px-6 py-4 whitespace-nowrap text-sm align-top">
                            {fileEntry.status === 'queued' && <span className="text-yellow-400">Queued</span>}
                            {fileEntry.status === 'pending' && <span className="text-slate-400">Pending...</span>}
                            {fileEntry.status === 'processing' && <div className="flex items-center text-sky-400"><LoadingSpinner className="w-4 h-4 mr-2"/> Processing...</div>}
                            {fileEntry.status === 'completed' && <span className="text-green-400">Completed</span>}
                            {fileEntry.status === 'error' && (
                              <div className="flex items-center text-red-400" title={fileEntry.errorMessage}>
                                <ExclamationTriangleIcon className="w-4 h-4 mr-2"/> Error
                              </div>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">{cleanGameNameForDisplay(instance.gameName)}</td>
                      <td className="px-6 py-4 whitespace-normal text-sm break-words max-w-xs">
                        {providerInfo ? (
                          <span className="text-slate-300">{providerInfo.provider}</span>
                        ) : instance.gameName ? (
                          <span className="text-yellow-400 italic" title="No matching game name found in Provider Data">
                            Not Found
                          </span>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{fileEntry.reportNumber || ''}</td>
                      <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">
                        {instance.files.length > 0 ? instance.files.map(f => f.name).join(', ') : ''}
                      </td>
                      <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">
                        {instance.files.length > 0 ? instance.files.map(f => getDisplayHash(f)).join(', ') : ''}
                      </td>
                    </tr>
                  );
                });
              } else {
                return (
                  <tr key={fileEntry.id} className="hover:bg-slate-700/30 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{fileEntry.pdfFileName}</td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {fileEntry.status === 'queued' && <span className="text-yellow-400">Queued</span>}
                        {fileEntry.status === 'pending' && <span className="text-slate-400">Pending...</span>}
                        {fileEntry.status === 'processing' && <div className="flex items-center text-sky-400"><LoadingSpinner className="w-4 h-4 mr-2"/> Processing...</div>}
                        {fileEntry.status === 'completed' && <span className="text-gray-400 italic">No game data found</span>}
                        {fileEntry.status === 'error' && (
                          <div className="flex items-center text-red-400" title={fileEntry.errorMessage}>
                            <ExclamationTriangleIcon className="w-4 h-4 mr-2"/> Error
                          </div>
                        )}
                      </td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs"></td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs"></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{fileEntry.reportNumber || ''}</td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs"></td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs"></td>
                  </tr>
                );
              }
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};