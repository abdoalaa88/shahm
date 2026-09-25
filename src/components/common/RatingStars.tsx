import React from 'react';
import { Star } from 'lucide-react';

interface RatingStarsProps {
  average: number;
  count: number;
  positivePercentage?: number | null;
  compact?: boolean;
}

export const RatingStars: React.FC<RatingStarsProps> = ({ average, count, positivePercentage, compact = false }) => (
  <span className={'inline-flex flex-wrap items-center gap-1 text-[#9B6B00] ' + (compact ? 'text-[10px]' : 'text-xs')} aria-label={`التقييم ${count ? average.toFixed(1) : '5.0'} من 5 نجوم`}>
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={(compact ? 'h-3 w-3' : 'h-3.5 w-3.5') + ' ' + (index < Math.round(count ? average : 5) ? 'fill-current' : 'fill-transparent')} />
      ))}
    </span>
    <strong className="font-bold">{count ? average.toFixed(1) : '5.0'}</strong>
    <span className="text-[#65736A]">{count ? `(${count})` : 'جديد'}</span>
    {count > 0 && positivePercentage != null && <span className="text-[#65736A]">· إيجابي {positivePercentage}%</span>}
  </span>
);
