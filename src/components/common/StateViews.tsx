import React, { useState, useEffect } from 'react';
import { Bell, WifiOff, AlertCircle, Clock, FileText, RefreshCw } from 'lucide-react';
import { registerPushNotifications } from '../../lib/push';

export const EmptyVolunteersFeed: React.FC = () => {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleEnablePush = async () => {
    setLoading(true);
    const success = await registerPushNotifications();
    setLoading(false);
    if (success) setPushEnabled(true);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-[#8A949E]/20 text-center space-y-3">
      <div className="w-12 h-12 bg-[#F7F8F9] rounded-full flex items-center justify-center mx-auto text-[#6B7280]">
        <Clock className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-[#1F2430]">مفيش طلبات قريبة منك دلوقتي</h3>
      <p className="text-xs text-[#6B7280] max-w-xs mx-auto leading-relaxed">
        هنبلغك أول ما يظهر طلب في منطقتك. تقدر تفعّل الإشعارات عشان يوصلك تنبيه فوري.
      </p>

      {!pushEnabled ? (
        <button
          onClick={handleEnablePush}
          disabled={loading}
          className="h-10 px-4 bg-[#E6F4ED] text-[#146B44] text-xs font-semibold rounded-xl hover:bg-[#146B44] hover:text-white transition-colors inline-flex items-center gap-1.5"
        >
          <Bell className="w-3.5 h-3.5" />
          تفعيل الإشعارات
        </button>
      ) : (
        <span className="text-xs text-[#146B44] font-semibold block">✓ الإشعارات مفعّلة بنجاح</span>
      )}
    </div>
  );
};

export const NetworkErrorView: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="bg-[#F7F8F9] p-6 rounded-2xl border border-[#8A949E]/30 text-center space-y-3">
    <div className="w-12 h-12 bg-[#FCEAEA] text-[#B53A3A] rounded-full flex items-center justify-center mx-auto">
      <WifiOff className="w-6 h-6" />
    </div>
    <h3 className="text-sm font-bold text-[#1F2430]">في مشكلة في الاتصال، جرّب تاني</h3>
    <p className="text-xs text-[#6B7280]">تأكد من اتصالك بالإنترنت واضغط على زر إعادة المحاولة.</p>
    <button
      onClick={onRetry}
      className="h-10 px-5 bg-white border border-[#8A949E] text-[#1F2430] text-xs font-semibold rounded-xl hover:bg-[#EEF0EF] transition-colors inline-flex items-center gap-1.5"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      إعادة المحاولة
    </button>
  </div>
);

export const RaceConditionToast: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-5 right-5 left-5 md:left-auto md:w-96 z-50 bg-[#1F2430] text-white p-4 rounded-2xl shadow-xl flex items-center justify-between gap-3 text-right">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-[#E8A33D] shrink-0" />
        <span className="text-xs font-medium">عذراً، تم قبول هذا الطلب من متطوع آخر للتو</span>
      </div>
      <button onClick={onClose} className="text-xs text-[#8A949E] hover:text-white shrink-0">حسناً</button>
    </div>
  );
};

export const ExistingOpenTripBanner: React.FC<{ onViewTrip: () => void }> = ({ onViewTrip }) => (
  <div className="p-4 bg-[#FBEFDC] border border-[#E8A33D]/40 rounded-2xl text-right space-y-2">
    <div className="flex items-center gap-2 text-[#8F5A0A] font-bold text-xs">
      <Clock className="w-4 h-4" />
      <span>عندك طلب مفتوح بالفعل — استنى الرد عليه الأول</span>
    </div>
    <p className="text-[11px] text-[#8F5A0A]/90 leading-relaxed">
      لضمان إتاحة الفرصة للجميع، يُسمح بطلب واحد نشط في نفس الوقت للحسابات الجديدة حتى إتمام 3 مشاوير.
    </p>
    <button onClick={onViewTrip} className="text-xs text-[#8F5A0A] font-bold underline flex items-center gap-1">
      <FileText className="w-3.5 h-3.5" />
      عرض الطلب المفتوح حالياً
    </button>
  </div>
);
