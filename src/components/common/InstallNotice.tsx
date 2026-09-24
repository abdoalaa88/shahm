import React from 'react';
import { Download, X } from 'lucide-react';

type InstallNoticeProps = {
  canInstall: boolean;
  showManualInstructions: boolean;
  onInstall: () => Promise<void>;
  onDismiss: () => void;
  message: string | null;
};

export const InstallNotice: React.FC<InstallNoticeProps> = ({ canInstall, showManualInstructions, onInstall, onDismiss, message }) => (
  <div
    role="status"
    aria-label="تثبيت تطبيق شَهْم"
    className="mx-auto mb-4 w-full max-w-2xl rounded-2xl border border-[#146B44]/10 bg-[#ecfef1] px-4 py-3 shadow-[0_8px_24px_-8px_rgba(20,107,68,0.18)]"
  >
    <div className="flex items-center gap-3 text-right">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#005131] shadow-[0_3px_10px_rgba(20,107,68,0.08)]">
        <Download className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1 text-sm leading-6 text-[#3f4942]">
        {message ? (
          <span className="font-semibold text-[#005131]">{message}</span>
        ) : showManualInstructions ? (
          <><strong className="block text-base text-[#005131]">ثبّت Shahm على موبايلك</strong><span>من زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».</span></>
        ) : (
          <><strong className="block text-base text-[#005131]">ثبّت Shahm على موبايلك</strong><span>خلي Shahm معاك بسهولة، واطلب رحلتك وقت ما تحتاجها.</span></>
        )}
      </div>

      {!message && canInstall && (
        <button
          onClick={onInstall}
          className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-[#146B44] px-4 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(20,107,68,0.18)] transition-colors hover:bg-[#005131] active:bg-[#005131]"
        >
          تثبيت التطبيق
        </button>
      )}

      <button
        onClick={onDismiss}
        aria-label="إغلاق"
        className="shrink-0 rounded-full p-2 text-[#6f7a71] transition-colors hover:bg-white hover:text-[#005131]"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  </div>
);
