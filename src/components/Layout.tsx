import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MobileBottomNav from './MobileBottomNav';

const pageMap: Record<string, string> = {
  home: '/',
  analytics: '/analytics',
  watchlist: '/watchlist',
  allocation: '/allocation',
  market: '/market',
  rebalance: '/rebalancing',
  scenario: '/scenario',
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
