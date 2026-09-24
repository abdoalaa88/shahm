import React, { useState, useEffect } from 'react';
import { Search, MapPin, Loader2, LocateFixed } from 'lucide-react';

interface LocationResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city_district?: string;
    hospital?: string;
    town?: string;
    village?: string;
    city?: string;
    county?: string;
    state?: string;
    country_code?: string;
  };
}

interface LocationPickerProps {
  label: string;
  placeholder: string;
  onSelect: (data: { areaLabel: string; fullAddress: string; lat: number; lng: number }) => void;
  /** Shows a "استخدم موقعي الحالي" button that fills this field from the
   * device's GPS instead of a text search — used for the requester's own
   * pickup point, never for a destination or someone else's location. */
  allowCurrentLocation?: boolean;
}

// Roughly bounds Egypt (Sinai included) so search suggestions never surface
// a same-named place abroad (e.g. searching "أكتوبر" should never return
// results in the US, Libya or Qatar).
const EGYPT_VIEWBOX = '24.6,31.9,37.0,21.9';
const EGYPT_NOMINATIM_PARAMS = 'countrycodes=eg&viewbox=' + EGYPT_VIEWBOX + '&bounded=1';

// Plot/building numbers ("483", "12-B") are common in Nominatim's data for
// newer Egyptian developments and are useless as a stand-alone area label —
// a volunteer can't judge distance or "is it on my way" from a bare number.
const isNumericOnly = (value: string) => /^[\d\s\-\/]+$/.test(value.trim());

const pickAreaLabel = (item: LocationResult): string => {
  const addr = item.address || {};

  // Most specific → least specific named-place fields, skipping anything
  // that's just digits.
  const namedCandidates = [
    addr.neighbourhood,
    addr.suburb,
    addr.quarter,
    addr.city_district,
    addr.hospital,
    addr.town,
    addr.village,
    addr.city,
    addr.county,
  ].filter((c): c is string => !!c && !isNumericOnly(c));

  const cityContext = addr.city || addr.town || addr.village || addr.county || addr.state;

  if (namedCandidates.length > 0) {
    const primary = namedCandidates[0];
    if (cityContext && cityContext !== primary) {
      return `${primary}، ${cityContext}`;
    }
    return primary;
  }

  const parts = item.display_name.split(',').map((p) => p.trim()).filter(Boolean);
  const firstMeaningfulPart = parts.find((p) => !isNumericOnly(p));

  if (firstMeaningfulPart && cityContext && firstMeaningfulPart !== cityContext) {
    return `${firstMeaningfulPart}، ${cityContext}`;
  }

  return firstMeaningfulPart || cityContext || parts[0] || item.display_name;
};

export const LocationPicker: React.FC<LocationPickerProps> = ({ label, placeholder, onSelect, allowCurrentLocation }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  useEffect(() => {
    if (!query || query.trim().length < 3 || query === selectedText) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
            query.trim()
          )}&addressdetails=1&limit=8&accept-language=ar&${EGYPT_NOMINATIM_PARAMS}`,
          {
            headers: {
              'Accept-Language': 'ar',
            },
            signal: controller.signal,
          }
        );
        if (!response.ok) throw new Error('Geocoding error');
        const data = await response.json();
        const egyptOnly = (data as LocationResult[]).filter(
          (item) => !item.address?.country_code || item.address.country_code.toLowerCase() === 'eg'
        );
        setResults(egyptOnly);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedText]);

  const applyResult = (item: LocationResult) => {
    const area = pickAreaLabel(item);

    setSelectedText(item.display_name);
    setQuery(item.display_name);
    setResults([]);

    onSelect({
      areaLabel: area.trim(),
      fullAddress: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    });
  };

  const handleUseCurrentLocation = () => {
    setLocateError(null);
    if (!('geolocation' in navigator)) {
      setLocateError('المتصفح ده مش بيدعم تحديد الموقع.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=ar`,
            { headers: { 'Accept-Language': 'ar' } }
          );
          if (!response.ok) throw new Error('Reverse geocoding error');
          const item: LocationResult = await response.json();

          if (item.address?.country_code && item.address.country_code.toLowerCase() !== 'eg') {
            setLocateError('الخدمة متاحة داخل مصر فقط حالياً.');
            return;
          }

          const area = pickAreaLabel(item);
          setSelectedText(item.display_name);
          setQuery(item.display_name);
          setResults([]);

          // Use the device's raw GPS fix for lat/lng — Nominatim reverse
          // geocoding often snaps to the nearest indexed building/road,
          // which can be off by hundreds of meters in areas with sparse
          // map data. Only the human-readable label/address comes from it.
          onSelect({
            areaLabel: area.trim(),
            fullAddress: item.display_name,
            lat: latitude,
            lng: longitude,
          });
        } catch {
          setLocateError('تعذر تحديد اسم موقعك، حاول تاني أو ابحث يدويًا.');
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        setLocating(false);
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? 'محتاجين إذن الوصول للموقع عشان نحدد مكانك الحالي.'
            : 'تعذر تحديد موقعك الحالي، حاول تاني.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  return (
    <div className="relative w-full space-y-1 text-right">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-[#1F2430]">{label}</label>
        {allowCurrentLocation && (
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={locating}
            className="text-xs font-semibold text-[#146B44] flex items-center gap-1 disabled:opacity-50"
          >
            {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
            استخدم موقعي الحالي
          </button>
        )}
      </div>

      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full h-[52px] pr-10 pl-4 bg-white border border-[#8A949E] rounded-xl text-base text-[#1F2430] placeholder:text-[#6B7280] focus:border-[#2F6FED] focus:outline-none transition-colors"
        />
        <div className="absolute right-3 text-[#6B7280]">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        </div>
      </div>

      {locateError && <p className="text-xs text-[#B53A3A]">{locateError}</p>}

      {results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-[#8A949E] rounded-xl shadow-lg overflow-hidden divide-y divide-[#EEF0EF]">
          {results.map((r, i) => (
            <li
              key={i}
              onClick={() => applyResult(r)}
              className="p-3 text-sm text-[#1F2430] hover:bg-[#F7F8F9] cursor-pointer flex items-start gap-2"
            >
              <MapPin className="w-4 h-4 text-[#1E8E5A] shrink-0 mt-0.5" />
              <span className="line-clamp-2">{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
