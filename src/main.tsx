import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

registerSW({ immediate: true });

const root = ReactDOM.createRoot(document.getElementById('root')!);
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const revealStartupApp = () => {
  const splash = document.getElementById('startup-splash');
  if (!splash) return;
  splash.classList.add('app-ready');
  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => {
    splash.classList.add('startup-splash-exit');
    window.setTimeout(() => splash.remove(), 420);
  }, motionReduced ? 450 : 2050);
};

const renderConfigurationError = () => {
  root.render(
    <main lang="ar" dir="rtl" className="grid min-h-screen place-items-center bg-[#F7F8F9] p-6 text-center font-sans text-[#1F2430]">
      <section className="max-w-lg rounded-2xl border border-[#8A949E]/20 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold">إعداد الاتصال غير مكتمل</h1>
        <p className="mt-3 text-sm leading-7 text-[#53645a]">
          أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY إلى إعدادات البيئة، ثم أعد تشغيل التطبيق.
        </p>
      </section>
    </main>,
  );
  revealStartupApp();
};

if (!supabaseUrl || !supabaseAnonKey) {
  renderConfigurationError();
} else {
  void import('./App')
    .then(({ App }) => {
      root.render(
        <React.StrictMode>
          <ErrorBoundary>
            <Suspense fallback={<div lang="ar" dir="rtl" className="p-6 text-center">جارٍ تحميل التطبيق…</div>}>
              <App />
            </Suspense>
          </ErrorBoundary>
        </React.StrictMode>,
      );
      revealStartupApp();
    })
    .catch(() => renderConfigurationError());
}
