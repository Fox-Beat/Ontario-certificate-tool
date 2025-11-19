import React from 'react';
import { DatabaseIcon } from './icons/DatabaseIcon';

interface ExcelDataProviderProps {
  providerDataText: string;
  onProviderDataTextChange: (text: string) => void;
  currentStatus: string;
}

export const ExcelDataProvider: React.FC<ExcelDataProviderProps> = ({ providerDataText, onProviderDataTextChange, currentStatus }) => {
  return (
    <div className="w-full p-6 bg-slate-800 border border-slate-700 rounded-xl shadow-lg space-y-4">
      <div className="flex items-center gap-3">
        <DatabaseIcon className="w-8 h-8 text-sky-400 flex-shrink-0" />
        <div>
            <h2 className="text-xl font-semibold text-slate-100">Game Provider Data</h2>
            <p className="text-sm text-slate-400">Paste data from Monday.com export. Expects tab-separated columns including: Name, Game Provider, Activated in IMS, Portal Live Date, IMS Game Code, Activated in IMS.</p>
        </div>
      </div>
      
      <textarea
        value={providerDataText}
        onChange={(e) => onProviderDataTextChange(e.target.value)}
        placeholder="Paste your full table export from Monday.com here..."
        rows={6}
        className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
        aria-label="Paste monday.com data for game providers"
      />
      <div className="flex flex-col sm:flex-row justify-end items-center gap-3">
        {currentStatus && (
            <p className="text-sm text-slate-400 text-right flex-grow" role="status">
                {currentStatus}
            </p>
        )}
      </div>
    </div>
  );
};