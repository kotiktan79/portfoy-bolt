import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MobileBottomNav from './MobileBottomNav';

const pageMap: Record<string, string> = {
  home: '/',
  market: '/market',
  analytics: '/analytics',
  ai: '/ai-advisor',
  allocation: '/allocation',
  watchlist: '/watchlist',
  rebalance: '/rebalancing',
  scenario: '/scenario',
  performance: '/performance',
  binance: '/binance',
  report: '/daily-report',
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
      <Outlet />
      <MobileBottomNav
        currentPage={currentPage}
        onNavigate={(page) => navigate(pageMap[page] || '/')}
      />
      <div className="md:hidden h-20 safe-area-inset-bottom" /> {/* Spacer for bottom nav */}
    </>
  );
}
