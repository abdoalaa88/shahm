import React from 'react';

type ErrorBoundaryProps = { children: React.ReactNode };
type ErrorBoundaryState = { hasError: boolean };

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-center">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#FCEAEA] space-y-3">
            <h1 className="font-bold text-[#1F2430]">حدث خطأ غير متوقع</h1>
            <p className="text-xs text-[#6B7280]">أعد تحميل الصفحة للمتابعة.</p>
            <button onClick={() => window.location.reload()} className="text-xs text-[#146B44] font-bold">
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}