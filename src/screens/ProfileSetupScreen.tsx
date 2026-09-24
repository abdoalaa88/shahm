import React from 'react';
import type { UserRole } from '../lib/supabase';
import { AlertCircle, Loader2, HeartPulse, ArrowLeft, UserRound } from 'lucide-react';

type ProfileSetupScreenProps = {
  configurationNotice: React.ReactNode;
  installNotice: React.ReactNode;
  errorMessage: string | null;
  profileSetupRequired: boolean;
  roleSelection: UserRole | null;
  firstName: string;
  phone: string;
  patientAge: string;
  patientCondition: string;
  authLoading: boolean;
  onSelectRole: (role: UserRole) => void;
  onFirstNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onPatientAgeChange: (value: string) => void;
  onPatientConditionChange: (value: string) => void;
  onSignOut: () => void;
  onBackToLogin: () => void;
  onGoogleLogin: () => void;
  onProfileSetup: () => void;
};

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  configurationNotice,
  installNotice,
  errorMessage,
  profileSetupRequired,
  roleSelection,
  firstName,
  phone,
  patientAge,
  patientCondition,
  authLoading,
  onSelectRole,
  onFirstNameChange,
  onPhoneChange,
  onPatientAgeChange,
  onPatientConditionChange,
  onSignOut,
  onBackToLogin,
  onGoogleLogin,
  onProfileSetup,
}) => (
  <div className="min-h-screen bg-[#EAF5EE] px-4 py-6 text-[#101f17]">
    {configurationNotice}
    {installNotice}

    <div className="mx-auto w-full max-w-[480px]">
      <header className="mb-4 flex items-center justify-between px-1">
        <button aria-label="عودة" onClick={() => { if (profileSetupRequired) { onSignOut(); } else { onBackToLogin(); } }} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#146B44] text-white shadow-sm">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[1.5rem] font-black tracking-tight text-[#146B44]">شَهْم</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#146B44]/10 bg-white/80 shadow-sm">
            <UserRound className="h-4 w-4 text-[#146B44]" />
          </div>
        </div>
      </header>

      <div className="rounded-[28px] bg-[#EAF5EE] shadow-[0_0_0_1px_rgba(20,107,68,0.04)] p-5">
        <div className="mb-4 rounded-[18px] bg-[#eaf6ef] p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[#146B44]">
            <span className="text-[0.8rem] font-bold">خطوة البداية في شَهْم</span>
          </div>
          <h2 className="mt-2 text-[1.75rem] font-black leading-[1.3] text-[#1F2430]">اختار دورك في شَهْم</h2>
          <p className="mt-2 text-[0.9rem] leading-[1.7] text-[#4b5f55]">
            نسعى لربط القلوب الرحيمة بمن يحتاج العون في طريقه للشفاء، بكرامة وأمان مجتمعي كامل.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-[16px] bg-[#FCEAEA] p-3 text-[0.82rem] text-[#B53A3A]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {profileSetupRequired && !roleSelection && (
          <div className="mb-4 space-y-2 rounded-[18px] bg-[#e6f8ec] p-4">
            <p className="text-sm font-bold text-[#005131]">اختار دورك عشان نكمّل إعداد حسابك</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onSelectRole('volunteer')} className="rounded-xl bg-white px-3 py-3 text-sm font-bold text-[#005131] shadow-sm">شهم</button>
              <button type="button" onClick={() => onSelectRole('requester')} className="rounded-xl bg-white px-3 py-3 text-sm font-bold text-[#005131] shadow-sm">مستفيد</button>
            </div>
          </div>
        )}

        <form onSubmit={(event) => { event.preventDefault(); onGoogleLogin(); }} className="space-y-4">
          <div className="rounded-[18px] border border-[#dfe9e2] bg-white p-4 shadow-sm">
            <label className="mb-2 block text-[0.95rem] font-bold text-[#1F2430]">اسمك الأول</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => onFirstNameChange(e.target.value)}
              placeholder="مثال: أحمد"
              className="h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]"
            />
          </div>

          <div className="rounded-[18px] border border-[#dfe9e2] bg-white p-4 shadow-sm">
            <label className="mb-2 block text-[0.95rem] font-bold text-[#1F2430]">رقم الجوال للتواصل</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]"
            />
          </div>

          {roleSelection === 'requester' && (
            <div className="space-y-3 rounded-[18px] border border-[#dfe9e2] bg-[#F7F8F9] p-4 shadow-sm">
              <div className="flex items-start gap-2 text-[0.82rem] leading-[1.7] text-[#4b5f55]">
                <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-[#146B44]" />
                <span>بنسألك عن حالة المريض مرة واحدة بس هنا، عشان الشهم اللي هيوصّله يبقى عارف يتعامل مع حالته بحرص وأمان من أول لحظة.</span>
              </div>

              <div>
                <label className="mb-2 block text-[0.95rem] font-bold text-[#1F2430]">سن المريض</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  required
                  value={patientAge}
                  onChange={(e) => onPatientAgeChange(e.target.value)}
                  placeholder="مثال: 65"
                  className="h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]"
                />
              </div>

              <div>
                <label className="mb-2 block text-[0.95rem] font-bold text-[#1F2430]">حالة المريض الصحية باختصار</label>
                <input
                  type="text"
                  required
                  value={patientCondition}
                  onChange={(e) => onPatientConditionChange(e.target.value)}
                  placeholder="مثال: غسيل كلوي، كرسي متحرك، بعد عملية..."
                  maxLength={300}
                  className="h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => (profileSetupRequired ? onProfileSetup() : onGoogleLogin())}
            disabled={authLoading}
            className="flex w-full items-center justify-center gap-3 rounded-[18px] border border-[#dfe9e2] bg-white px-4 py-3 text-[1rem] font-bold text-[#1F2430] shadow-sm transition hover:bg-[#F7F8F9]"
          >
            {authLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : profileSetupRequired ? null : <span className="text-[#4285F4]">G</span>}
            <span>{profileSetupRequired ? 'حفظ بيانات الحساب' : 'الدخول باستخدام Google'}</span>
          </button>
        </form>
      </div>
    </div>
  </div>
);
