import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import RomaniaRenovationPage from './RomaniaRenovationPage';
import { buildRenovationSummary } from '../lib/romaniaRenovation';
import MobileBottomNav from '../components/MobileBottomNav';

describe('Romanya Ev Tadilatı ekranı', () => {
  it('kendi başlığıyla listeyi, yılı ve toplamı gösterir', () => {
    render(
      <MemoryRouter>
        <RomaniaRenovationPage summary={buildRenovationSummary({})} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Romanya Ev Tadilatı' })).toBeInTheDocument();
    expect(screen.getByText(/Portföy toplamına girmez/)).toBeInTheDocument();
    expect(screen.getByText('1 Eylül 2025')).toBeInTheDocument();
    expect(screen.getByText('25.000 RON')).toBeInTheDocument();
    expect(screen.getByText('≈ €32.470')).toBeInTheDocument();
    expect(screen.getByText('€12.470')).toBeInTheDocument();
  });

  it('alt menüde kendi sekmesi ve rotası vardır', () => {
    const onNavigate = () => {};
    render(<MobileBottomNav currentPage="ev" onNavigate={onNavigate} />);
    expect(screen.getByRole('button', { name: 'Ev' })).toBeInTheDocument();
    const app = readFileSync('src/App.tsx', 'utf8');
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    expect(app).toContain('path="/romanya-ev"');
    expect(layout).toContain("ev: '/romanya-ev'");
    expect(readFileSync('src/components/AssetAllocationPage.tsx', 'utf8')).not.toContain('RomaniaRenovation');
  });
});
