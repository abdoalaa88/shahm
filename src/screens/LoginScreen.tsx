import React from 'react';
import type { UserRole } from '../lib/supabase';
import { BrandMark } from '../components/common/BrandMark';
import { ArrowLeft, CarFront, HeartHandshake, UserRound, Settings2, LockKeyhole } from 'lucide-react';

type LoginScreenProps = {
  configurationNotice: React.ReactNode;
  installNotice: React.ReactNode;
  authLoading: boolean;
  onLogin: (role: UserRole) => void;
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ configurationNotice, installNotice, authLoading, onLogin }) => (
  <div className="stitch-page px-4 py-6">
    {configurationNotice}
    {installNotice}

    <div className="mx-auto w-full max-w-[480px]">
      <header className="mb-3 flex items-center justify-between px-1">
        <button aria-label="تسجيل الدخول" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#146B44] text-white shadow-sm">
          <UserRound className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[1.5rem] font-black tracking-tight text-[#146B44]">شَهْم</span>
          <BrandMark className="h-8 w-8" />
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#146B44]/10 bg-white/80 shadow-sm">
            <Settings2 className="h-4 w-4 text-[#146B44]" />
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-5 px-1 pb-4 pt-4">
        <div className="mb-5 flex justify-center">
          <div className="flex h-36 w-36 items-center justify-center rounded-full border-[10px] border-[#dfece4] bg-white/70 shadow-[0_12px_32px_rgba(20,107,68,0.08)]">
            <BrandMark className="h-20 w-20" />
          </div>
        </div>

        <h1 className="mb-1 text-center text-[2rem] font-bold leading-[1.35] text-[#005131]">
          أهلاً بك في شَهْم
        </h1>
        <p className="mx-auto max-w-[330px] text-center text-sm leading-7 text-[#3f4942]">
          الناس للناس . منصة اجتماعية لتوصيل المرضى الأكثر احتياجًا لمواعيد العلاج وأماكن الرعاية بأمان وكرامة
        </p>

        <div className="stitch-soft-card flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#146b44] text-white"><HeartHandshake className="h-5 w-5" /></div>
          <p className="text-sm font-semibold leading-6 text-[#005131]">مشاوير مجانية للمواعيد العلاجية، والناس لبعضها.</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onLogin('volunteer')}
            disabled={authLoading}
            className="group flex min-h-[58px] w-full items-center justify-between rounded-xl bg-[#005131] px-4 py-2 text-right text-white shadow-lg active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
                <CarFront className="h-5 w-5" />
              </span>
              <span className="flex flex-col text-right"><span className="text-base font-bold">الدخول كشهم</span><span className="text-xs text-[#98e9b8]">أرغب في الوقوف بجانب الناس وكسب الأجر</span></span>
            </span>
            <ArrowLeft className="h-5 w-5 opacity-80" />
          </button>

          <button
            onClick={() => onLogin('requester')}
            disabled={authLoading}
            className="group flex min-h-[58px] w-full items-center justify-between rounded-xl bg-white px-4 py-2 text-right text-[#005131] shadow-md active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4ED]">
                <HeartHandshake className="h-5 w-5 text-[#146B44]" />
              </span>
              <span className="flex flex-col text-right"><span className="text-base font-bold">الدخول كصاحب طلب</span><span className="text-xs text-[#3f4942]">محتاج مشوار لميعادي الطبي</span></span>
            </span>
            <ArrowLeft className="h-5 w-5 text-[#6f7a71]" />
          </button>
        </div>

        <div className="stitch-soft-card flex items-start gap-3 p-4">
          <LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-[#005131]" />
          <p className="text-xs leading-6 text-[#3f4942]">خدمة غير ربحية ومجانية بالكامل، وبياناتك وخصوصيتك في أمان تام.</p>
        </div>

      </main>
    </div>
  </div>
);
