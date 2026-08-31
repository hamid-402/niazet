'use client';

import { useEffect, useState } from 'react';

export function NetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-3 z-toast mx-auto max-w-xl rounded-control border border-warning-border bg-warning-subtle px-4 py-3 text-center text-sm font-medium text-warning shadow-elevation-3">
      اتصال اینترنت قطع است؛ پس از برقراری اتصال دوباره تلاش کنید.
    </div>
  );
}
