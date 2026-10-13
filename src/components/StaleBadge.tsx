export function StaleBadge({ kind }: { kind: 'price' | 'research' }) {
  const text = kind === 'price' ? 'Fiyat eski' : 'Araştırma eski';
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
      {text}
    </span>
  );
}
