import { useEffect } from 'react';

/**
 * DashboardApp previously rendered the now-removed LiveDashboard component.
 * It now redirects to the main application which serves as the single dashboard.
 */
function DashboardApp() {
  useEffect(() => {
    window.location.href = '/';
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
        <p className="text-white text-xl font-semibold">Yonlendiriliyor...</p>
        <p className="text-gray-400 text-sm mt-2">Ana sayfaya yonlendiriliyorsunuz</p>
      </div>
    </div>
  );
}

export default DashboardApp;
