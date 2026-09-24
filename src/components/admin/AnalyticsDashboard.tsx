import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  Users,
  Car,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  TrendingUp,
  MapPin,
  Clock,
  Loader2,
  RefreshCw
} from 'lucide-react';

export const AnalyticsDashboard: React.FC = () => {
  const [kpis, setKpis] = useState<any>(null);
  const [geoStats, setGeoStats] = useState<any[]>([]);
  const [peakHours, setPeakHours] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        { data: kpiData },
        { data: geoData },
        { data: hrData },
      ] = await Promise.all([
        supabase.rpc('get_analytics_kpis'),
        supabase.rpc('get_geographic_distribution', { p_min_threshold: 5 }),
        supabase.rpc('get_peak_hours_distribution'),
      ]);

      if (kpiData && kpiData.length > 0) setKpis(kpiData[0]);
      if (geoData) setGeoStats(geoData);
      if (hrData) setPeakHours(hrData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-16 text-center text-[#6B7280]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#146B44]" />
        <p className="text-sm font-medium">جاري معالجة الإحصائيات التجميعية المشفرة...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 text-right" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#8A949E]/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[#146B44]" />
            <h1 className="text-2xl font-bold text-[#1F2430]">مؤشرات الأثر والتكافل المجتمعي</h1>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            إحصاءات مجمعة ومشفرة تحمي خصوصية المستفيدين والمتطوعين (k-Anonymity ≥ 5)
          </p>
        </div>
        <button
          onClick={loadData}
          className="self-start sm:self-auto h-9 px-3 bg-white border border-[#8A949E] rounded-xl text-xs font-semibold text-[#1F2430] hover:bg-[#F7F8F9] flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث البيانات
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[#6B7280]">
            <span className="text-xs">المسجلين</span>
            <Users className="w-4 h-4 text-[#2F6FED]" />
          </div>
          <div className="text-2xl font-black text-[#1F2430]">{kpis?.total_users || 0}</div>
          <div className="text-[11px] text-[#6B7280]">
            {kpis?.total_volunteers || 0} متطوع · {kpis?.total_requesters || 0} صاحب طلب
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[#6B7280]">
            <span className="text-xs">المشاوير المنشورة</span>
            <Car className="w-4 h-4 text-[#1E8E5A]" />
          </div>
          <div className="text-2xl font-black text-[#1F2430]">{kpis?.total_trips || 0}</div>
          <div className="text-[11px] text-[#146B44] font-medium">خدمة لوجه الله تعالى</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[#6B7280]">
            <span className="text-xs">نسبة الإنجاز والتوصيل</span>
            <CheckCircle2 className="w-4 h-4 text-[#146B44]" />
          </div>
          <div className="text-2xl font-black text-[#146B44]">{kpis?.completion_rate || 0}%</div>
          <div className="text-[11px] text-[#6B7280]">{kpis?.completed_trips || 0} مشوار مكتمل</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[#6B7280]">
            <span className="text-xs">نسبة الإلغاء</span>
            <XCircle className="w-4 h-4 text-[#B53A3A]" />
          </div>
          <div className="text-2xl font-black text-[#B53A3A]">{kpis?.cancellation_rate || 0}%</div>
          <div className="text-[11px] text-[#6B7280]">{kpis?.cancelled_trips || 0} ملغي قبل القبول</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#146B44]" />
              <h2 className="text-sm font-bold text-[#1F2430]">التوزيع الجغرافي للطلبات</h2>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#146B44] bg-[#E6F4ED] px-2 py-0.5 rounded-full font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>مُعمّى (≥ 5 حالات)</span>
            </div>
          </div>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={geoStats} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} />
                <YAxis dataKey="area_label" type="category" tick={{ fontSize: 11, fill: '#1F2430' }} width={110} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2430', borderRadius: '12px', border: 'none', color: '#fff' }} />
                <Bar dataKey="trip_count" name="عدد الطلبات" fill="#146B44" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-3">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[#2F6FED]" />
            <h2 className="text-sm font-bold text-[#1F2430]">أوقات الذروة واحتياج النقل</h2>
          </div>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="hour_of_day" tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 9, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2430', borderRadius: '12px', border: 'none', color: '#fff' }} />
                <Bar dataKey="trip_count" fill="#2F6FED" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
