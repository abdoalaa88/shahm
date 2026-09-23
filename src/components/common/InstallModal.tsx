import React from 'react';
import { Download, X } from 'lucide-react';

interface InstallModalProps {
  deferredPrompt: any;
  onClose: () => void;
}

export const InstallModal: React.FC<InstallModalProps> = ({ deferredPrompt, onClose }) => {
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('تم تثبيت التطبيق بنجاح');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-4">
          <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <Download className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-bold text-gray-900">تثبيت التطبيق</h3>
          
          <p className="text-gray-600 text-sm">
            قم بتثبيت التطبيق على جهازك للوصول السريع وتجربة استخدام أفضل.
          </p>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium transition-colors"
            >
              إلغاء
            </button>
            <button
              onClick={handleInstallClick}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors"
            >
              تثبيت الآن
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
