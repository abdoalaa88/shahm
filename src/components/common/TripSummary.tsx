import React from 'react';
import type { RequesterRelation } from '../../lib/supabase';

const RELATION_LABELS: Record<RequesterRelation, string> = {
  patient: 'أنا',
  guardian: 'شخص تحت رعايتي',
  companion: 'مرافقة شخص',
};

type TripSummaryProps = {
  origin: string;
  destination: string;
  relation?: RequesterRelation;
  passengerCount?: number | null;
  notes?: string | null;
  footnote?: string;
};

/** One card with the essential trip details, so the same facts are never repeated on screen. */
export const TripSummary: React.FC<TripSummaryProps> = ({ origin, destination, relation, passengerCount, notes, footnote }) => {
  const rows: Array<[string, string]> = [
    ['من', origin],
    ['إلى', destination],
  ];
  if (relation) rows.push(['الطلب لـ', RELATION_LABELS[relation]]);
  rows.push(['عدد الأفراد', String(passengerCount ?? 1)]);
  if (notes) rows.push(['ملاحظات', notes]);

  return (
    <div className="stitch-soft-card p-4 text-right">
      <dl className="divide-y divide-dashed divide-[#bfc9bf] text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="shrink-0 text-[#3f4942]">{label}</dt>
            <dd className="font-semibold text-[#101f17]">{value}</dd>
          </div>
        ))}
      </dl>
      {footnote && <p className="mt-3 text-xs leading-6 text-[#3f4942]">{footnote}</p>}
    </div>
  );
};
