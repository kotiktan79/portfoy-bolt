import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHeader } from './DashboardHeader';
import MobileBottomNav from './MobileBottomNav';
import AIAdvisorPage from '../pages/AIAdvisorPage';
import ResearchPage from '../pages/ResearchPage';
import { LanguageProvider } from '../contexts/LanguageContext';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  },
}));

function header() {
  return render(
    <LanguageProvider>
      <DashboardHeader
        connectionStatus="connected"
        refreshing={false}
        isDark={false}
        notificationsEnabled
        onToggleDark={() => {}}
        onRefresh={() => {}}
        onAddHolding={() => {}}
        onShowAlerts={() => {}}
        onShowExport={() => {}}
        onShowBackup={() => {}}
        onShow2FA={() => {}}
        onShowAllocation={() => {}}
        onShowAIAdvisor={() => {}}
        onShowPerformance={() => {}}
        onShowResearch={() => {}}
        onShowProjection={() => {}}
        onShowRenovation={() => {}}
        onShowRebalanceModal={() => {}}
        onEnableNotifications={() => {}}
        onThemeCycle={() => {}}
      />
    </LanguageProvider>,
  );
}

describe('yapay zekâ girişleri gizli', () => {
  it('üst menüde AI Danışman ve Araştırma yok, diğer sayfalar durur', () => {
    header();
    expect(screen.queryByText('AI Danışman')).toBeNull();
    expect(screen.queryByText('Araştırma')).toBeNull();
    expect(screen.getByText('Performans')).toBeTruthy();
    expect(screen.getByText('Ev Tadilatı')).toBeTruthy();
    expect(screen.getByText('Varlık Ekle')).toBeTruthy();
  });

  it('alt menüde Araştır yok, Ev ve Ana durur', () => {
    render(<MobileBottomNav onNavigate={() => {}} currentPage="home" />);
    expect(screen.queryByText('Araştır')).toBeNull();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('Ev')).toBeTruthy();
    expect(screen.getByText('Rapor')).toBeTruthy();
  });

  it('AI Danışman adresi sohbet yerine kapalı mesajı gösterir', () => {
    render(
      <MemoryRouter>
        <AIAdvisorPage />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Yapay zekâ özelliği kapalı').length).toBeGreaterThan(0);
    expect(screen.queryByText('AI Sohbet')).toBeNull();
    expect(screen.queryByPlaceholderText(/soru sorun/i)).toBeNull();
  });

  it('araştırma sayfasında çalıştırma düğmesi yok', async () => {
    render(
      <MemoryRouter>
        <ResearchPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Yeni araştırma üretilmez/)).toBeTruthy();
    expect(screen.queryByText('Şimdi Çalıştır')).toBeNull();
    expect(screen.queryByText('İlk Raporu Üret')).toBeNull();
  });
});
