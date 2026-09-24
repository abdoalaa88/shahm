import React, { useState } from 'react';
import type { Profile } from '../../lib/supabase';
import { HeartPulse, Loader2, LockKeyhole, Pencil, UserRoundCheck } from 'lucide-react';

export type AccountUpdates = {
  firstName: string;
  phone: string;
  patientAge?: string;
  patientCondition?: string;
};

type AccountTabProps = {
  profile: Profile | null;
  onSignOut: () => void;
  // Resolves to null on success, or a user-facing error message to show inline.
  onUpdateProfile: (updates: AccountUpdates) => Promise<string | null>;
  accountUpdateLoading: boolean;
};

const inputClass =
  'h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]';
const labelClass = 'mb-2 block text-[0.95rem] font-bold text-[#1F2430]';

export const AccountTab: React.FC<AccountTabProps> = ({ profile, onSignOut, onUpdateProfile, accountUpdateLoading }) => {
  const isRequester = profile?.role === 'requester';
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientCondition, setPatientCondition] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const startEditing = () => {
    setFirstName(profile?.first_name ?? '');
    setPhone(profile?.phone_number ?? '');
    setPatientAge(profile?.patient_age != null ? String(profile.patient_age) : '');
    setPatientCondition(profile?.patient_condition ?? '');
    setFormError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setFormError(null);
    setEditing(false);
  };

  const handleSave = async () => {
    if (accountUpdateLoading) return;
    if (!firstName.trim() || !/^01\d{9}$/.test(phone.trim())) {
      setFormError('أدخل الاسم ورقم هاتف مصري صحيح يبدأ بـ 01.');
      return;
    }
    if (isRequester) {
      const parsedAge = Number(patientAge);
      if (!patientAge.trim() || !Number.isFinite(parsedAge) || parsedAge < 0 || parsedAge > 120) {
        setFormError('أدخل سن المريض بشكل صحيح.');
        return;
      }
      if (!patientCondition.trim() || patientCondition.trim().length < 2) {
        setFormError('اكتب وصف مختصر لحالة المريض الصحية.');
        return;
      }
    }
    setFormError(null);
    const error = await onUpdateProfile({
      firstName,
      phone,
      ...(isRequester ? { patientAge, patientCondition } : {}),
    });
    if (error) {
      setFormError(error);
      return;
    }
    setEditing(false);
  };

  return (
    <section className="space-y-4">
      <div className="stitch-card flex items-center gap-3 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#146b44] text-white"><UserRoundCheck className="h-7 w-7" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#3f4942]">حساب شَهْم</p>
          <h2 className="text-xl font-bold text-[#101f17]">{profile?.first_name}</h2>
          <p className="text-sm text-[#005131]">{profile?.role === 'volunteer' ? 'شهم' : 'مستفيد'}</p>
        </div>
        {!editing && profile && (
          <button
            type="button"
            onClick={startEditing}
            className="flex items-center gap-1 rounded-full bg-[#e6f8ec] px-4 py-2 text-sm font-semibold text-[#005131]"
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="rounded-[18px] border border-[#dfe9e2] bg-white p-4 shadow-sm">
            <label className={labelClass}>اسمك الأول</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="مثال: أحمد"
              className={inputClass}
            />
          </div>

          <div className="rounded-[18px] border border-[#dfe9e2] bg-white p-4 shadow-sm">
            <label className={labelClass}>رقم الجوال للتواصل</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              className={inputClass}
            />
          </div>

          {isRequester && (
            <div className="space-y-3 rounded-[18px] border border-[#dfe9e2] bg-[#F7F8F9] p-4 shadow-sm">
              <div className="flex items-start gap-2 text-[0.82rem] leading-[1.7] text-[#4b5f55]">
                <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-[#146B44]" />
                <span>بيانات المريض دي بتظهر للشهم اللي يقبل مشوارك، فحافظ عليها محدّثة.</span>
              </div>
              <div>
                <label className={labelClass}>سن المريض</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  placeholder="مثال: 65"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>حالة المريض الصحية باختصار</label>
                <input
                  type="text"
                  value={patientCondition}
                  onChange={(e) => setPatientCondition(e.target.value)}
                  placeholder="مثال: غسيل كلوي، كرسي متحرك، بعد عملية..."
                  maxLength={300}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {formError && <p role="alert" className="rounded-xl bg-[#fceaea] px-4 py-3 text-sm text-[#b53a3a]">{formError}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={accountUpdateLoading}
              className="stitch-primary-button flex items-center justify-center gap-2 text-base disabled:opacity-60"
            >
              {accountUpdateLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              حفظ
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={accountUpdateLoading}
              className="rounded-full bg-[#e6f8ec] py-3 font-semibold text-[#005131] disabled:opacity-60"
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        profile && (
          <div className="stitch-soft-card space-y-2 p-4 text-right text-sm text-[#3f4942]">
            <div><strong>رقم الجوال:</strong> <span dir="ltr">{profile.phone_number}</span></div>
            {isRequester && profile.patient_age != null && <div><strong>سن المريض:</strong> {profile.patient_age}</div>}
            {isRequester && profile.patient_condition && <div><strong>حالة المريض:</strong> {profile.patient_condition}</div>}
          </div>
        )
      )}

      <div className="stitch-soft-card flex items-start gap-3 p-4"><LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-[#005131]" /><p className="text-sm leading-7 text-[#3f4942]">بياناتك محفوظة ولا يتم كشف معلومات التواصل إلا عند الحاجة وبحسب حالة المشوار.</p></div>
      <button type="button" onClick={onSignOut} className="w-full rounded-full bg-[#fceaea] py-3 font-semibold text-[#b53a3a]">تسجيل الخروج</button>
    </section>
  );
};
