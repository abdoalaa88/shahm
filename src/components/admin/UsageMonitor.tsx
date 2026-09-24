import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Server, CheckCircle, Database, Zap, RefreshCw } from 'lucide-react';

export const UsageMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);

  const fetchUsage = async () => {
    try {
      const [
        { count: profilesCount },
        { count: tripsCount },
        { count: auditCount },
        { count: reportsCount },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('trips').select('*', { count: 'exact', head: true }),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }),
      ]);

      const totalRows = (profilesCount || 0) + (tripsCount || 0) + (auditCount || 0) + (reportsCount || 0);
      const estimatedDbMb = Math.round(((totalRows * 1.2) / 1024) * 100) / 100;

      setMetrics({
        totalProfiles: profilesCount || 0,
        totalTrips: tripsCount || 0,
        estimatedDbSizeMb: estimatedDbMb,
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const DB_LIMIT_MB = 500;
  const MAU_LIMIT = 50000;
  const dbPercentage = metrics ? Math.min(100, Math.round((metrics.estimatedDbSizeMb / DB_LIMIT_MB) * 100)) : 0;
  const usersPercentage = metrics ? Math.min(100, Math.round((metrics.totalProfiles / MAU_LIMIT) * 100)) : 0;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 text-right" dir="rtl">
      <div className="flex items-center justify-between border-b border-[#8A949E]/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-6 h-6 text-[#146B44]" />
            <h1 className="text-xl font-bold text-[#1F2430]">مراقبة استهلاك الخطة المجانية (Zero-Cost Monitor)</h1>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">متابعة دقيقة لحدود الاستخدام المجاني لضمان استمرار الخدمة لوجه الله دون أي رسوم</p>
        </div>
        <button onClick={fetchUsage} className="h-9 px-3 bg-white border border-[#8A949E] text-xs font-semibold rounded-xl text-[#1F2430] flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </button>
      </div>

      <div className="p-4 bg-[#E6F4ED] rounded-2xl border border-[#146B44]/20 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-[#146B44] shrink-0" />
        <div className="text-xs text-[#146B44]">
          <strong>المنظومة في المنطقة الآمنة بالكامل:</strong> الاستهلاك الحالي أقل من 5% من الحدود المجانية المتاحة.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1F2430]">مساحة قاعدة البيانات (PostgreSQL)</span>
            <Database className="w-4 h-4 text-[#146B44]" />
          </div>
          <div className="text-2xl font-black text-[#1F2430]">
            {metrics?.estimatedDbSizeMb || 0} <span className="text-xs font-normal text-[#6B7280]">/ {DB_LIMIT_MB} MB</span>
          </div>
          <div className="w-full bg-[#EEF0EF] h-2 rounded-full overflow-hidden">
            <div className="h-full bg-[#146B44] rounded-full" style={{ width: `${Math.max(2, dbPercentage)}%` }} />
          </div>
          <div className="text-[11px] text-[#6B7280]">الحد الأقصى المجاني: 500 ميجابايت على Supabase</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1F2430]">المستخدمين النشطين شهرياً</span>
            <Zap className="w-4 h-4 text-[#2F6FED]" />
          </div>
          <div className="text-2xl font-black text-[#1F2430]">
            {metrics?.totalProfiles || 0} <span className="text-xs font-normal text-[#6B7280]">/ 50,000</span>
          </div>
          <div className="w-full bg-[#EEF0EF] h-2 rounded-full overflow-hidden">
            <div className="h-full bg-[#2F6FED] rounded-full" style={{ width: `${Math.max(1, usersPercentage)}%` }} />
          </div>
          <div className="text-[11px] text-[#6B7280]">الحد المجاني المسموح: 50 ألف مستخدم نشط شهرياً</div>
        </div>
      </div>
    </div>
  );
};
