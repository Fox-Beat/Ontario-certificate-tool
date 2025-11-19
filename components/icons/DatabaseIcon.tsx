
import React from 'react';

interface IconProps {
  className?: string;
}

// Simple database icon
export const DatabaseIcon: React.FC<IconProps> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24" 
    strokeWidth={1.5} 
    stroke="currentColor" 
    className={`w-6 h-6 ${className}`}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v1.5H3.75V6zM3.75 12A2.25 2.25 0 016 9.75h12A2.25 2.25 0 0120.25 12v1.5H3.75V12zM3.75 18A2.25 2.25 0 016 15.75h12A2.25 2.25 0 0120.25 18v1.5H3.75V18z" />
 </svg>
);
