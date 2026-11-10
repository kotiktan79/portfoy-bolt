import { expectedPath, pathMilestones, explainSpendDown, type SpendDownPlan, type SalaryRuleConfig } from '../lib/spendDownSalary';
const eur = (n: number) => `€${Math.round(n).toLocaleString('tr-TR')}`;

export function SpendDownProjection({ plan, config }: { plan: SpendDownPlan; config: SalaryRuleConfig }) {
  const path = pathMilestones(expectedPath({ startYear: plan.year, portfolioEUR: plan.baseEUR, config }));
  return <section className="card-primary p-5 space-y-3">
    <h3 className="text-lg font-bold">Dinamik maaş planı</h3>
    <p className="text-3xl font-bold text-emerald-700">{eur(plan.monthlyEUR)}<span className="text-sm">/ay · {plan.year}</span></p>
    <p>Portföyden {eur(plan.fromPortfolioEUR)} + kasadan {eur(plan.fromKasaEUR)}</p>
    {explainSpendDown(plan, config).map(line => <p key={line} className="text-sm">{line}</p>)}
    <p className="text-xs text-slate-500">Bu bir hesap varsayımıdır; gelecekteki gelir garanti değildir. Kasa sermayeye ayrıca eklenmedi.</p>
    <table className="w-full text-sm"><thead><tr><th className="text-left">Yıl</th><th className="text-right">Portföy</th><th className="text-right">Maaş/ay</th></tr></thead>
      <tbody>{path.map(row => <tr key={row.year}><td>{row.year}</td><td className="text-right">{eur(row.startEUR)}</td><td className="text-right">{eur(row.monthlyEUR)}</td></tr>)}</tbody>
    </table>
  </section>;
}
