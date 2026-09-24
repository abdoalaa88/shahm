import React from 'react';

export const BrandMark: React.FC<{ className?: string }> = ({ className = 'w-20 h-20' }) => (
  <svg viewBox="0 0 120 120" className={className} aria-label="شعار شَهْم" role="img">
    <defs>
      <linearGradient id="shahmBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1E8E5A" />
        <stop offset="100%" stopColor="#146B44" />
      </linearGradient>
      <linearGradient id="shahmSoftGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E6F4ED" />
        <stop offset="100%" stopColor="#C2E6D4" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="56" fill="url(#shahmSoftGlow)" />
    <circle cx="60" cy="60" r="48" fill="#FFFFFF" />
    <path d="M60 28 C64 36 76 46 76 58 C76 67.5 68.8 75 60 75 C51.2 75 44 67.5 44 58 C44 46 56 36 60 28 Z" fill="url(#shahmBrandGrad)"/>
    <circle cx="60" cy="56" r="6" fill="#FFFFFF"/>
    <path d="M36 70 C42 82 50 88 60 88 C70 88 78 82 84 70 C80 76 71 82 60 82 C49 82 40 76 36 70 Z" fill="#146B44"/>
  </svg>
);
