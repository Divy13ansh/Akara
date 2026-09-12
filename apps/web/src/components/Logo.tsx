import React from 'react';
import { handleImageFallback } from './CardThemeUtils';

export function Logo({ size = "small", inverted = false }: { size?: "small" | "large", inverted?: boolean }) {
  const isLarge = size === "large";
  
  return (
    <div 
      className={`flex items-center justify-center ${isLarge ? "text-[120px] sm:text-[180px] md:text-[220px]" : "text-4xl md:text-5xl"} ${inverted ? "text-white" : "text-[#0a0a0a]"} leading-none`} 
      style={{ fontFamily: "'Tropika Island', sans-serif" }}
    >
      <span style={{ transform: isLarge ? 'translateY(5px)' : 'translateY(0px)' }}>A</span>
      <img 
        src="/hindi_letter.png" 
        alt="Ksha" 
        className={`${isLarge ? "w-[100px] sm:w-[140px] md:w-[170px] mx-1 md:mx-3" : "w-[28px] md:w-[34px] mx-0.5"} object-contain`}
        style={{ 
          transform: isLarge ? 'translateY(26px)' : 'translateY(8px)',
          imageRendering: 'high-quality',
          filter: inverted ? 'brightness(0) invert(1)' : 'none'
        }}
        onError={(e) => handleImageFallback(e)}
      />
      <span style={{ transform: isLarge ? 'translateY(5px)' : 'translateY(0px)' }}>ara</span>
    </div>
  );
}
