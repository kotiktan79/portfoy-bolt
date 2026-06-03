import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import MobileBottomNav from './MobileBottomNav';
import { signOut } from './AuthGate';

const pageMap: Record<string, string> = {
  home: '/',
  ai: '/ai-advisor',
  allocation: '/allocation',
  performance: '/performance',
  report: '/daily-report',
  research: '/research',
};

const reverseMap: Record<string, string> = Object.fromEntries(
  Object.entries(pageMap).map(([k, v]) => [v, k])
);

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = reverseMap[location.pathname] || 'home';

  return (
    <>
      <button
        onClick={() => signOut()}
        title="Çıkış yap"
        aria-label="Çıkış yap"
        className="fixed top-3 right-3 z-50 h-9 w-9 rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur border border-slate-200 dark:border-gray-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shadow-sm hover:text-slate-900 dark:hover:text-slate-100"
      >
        <LogOut size={16} />
      </button>
      <div key={location.pathname} className="animate-page-enter">
        <Outlet />
      </div>
      <MobileBottomNav
        currentPage={currentPage}
        onNavigate={(page) => navigate(pageMap[page] || '/')}
      />
      <div className="md:hidden h-20 safe-area-inset-bottom" />
    </>
  );
}
