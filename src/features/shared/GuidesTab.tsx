import React from 'react';
import { Shield } from 'lucide-react';

export const GuidesTab: React.FC = () => (
  <section className="space-y-4">
    <div className="stitch-soft-card flex items-start gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dbece0] text-[#005131]"><Shield className="h-5 w-5" /></div>
      <div><h2 className="text-lg font-bold text-[#005131]">إرشادات شَهْم</h2><p className="mt-1 text-sm leading-7 text-[#3f4942]">نحافظ على خصوصية المرضى وننسّق كل مشوار بهدوء وكرامة.</p></div>
    </div>
    {['العنوان ورقم الهاتف لا يظهران قبل قبول المشوار.', 'التزم بالرحلة وتواصل بلطف مع الطرف الآخر.', 'أي بلاغ تتم مراجعته بسرية من فريق الأمان.'].map((text, index) => (
      <div key={text} className="stitch-card flex items-start gap-3 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e6f8ec] text-[#005131] text-sm font-bold">{index + 1}</div>
        <p className="text-sm leading-7 text-[#3f4942]">{text}</p>
      </div>
    ))}
  </section>
);
