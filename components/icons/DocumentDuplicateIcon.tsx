
import React from 'react';

interface IconProps {
  className?: string;
}

export const DocumentDuplicateIcon: React.FC<IconProps> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24" 
    strokeWidth={1.5} 
    stroke="currentColor" 
    className={`w-6 h-6 ${className}`}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.48-7.5-8.975V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.003c.032.02.062.041.094.063m7.5 10.375V14.25c0-1.309-.726-2.489-1.802-3.045M8.25 17.25v.003H6.75V11.25A2.25 2.25 0 019 9h3a2.25 2.25 0 012.25 2.25v.003" />
  </svg>
);