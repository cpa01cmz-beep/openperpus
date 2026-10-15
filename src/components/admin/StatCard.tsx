type Props = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'rose';
};

export default function StatCard({ label, value, hint, tone = 'neutral' }: Props) {
  const rose = tone === 'rose';
  return (
    <div
      className={`rounded-[var(--radius-lg)] border bg-surface p-4 shadow-[var(--shadow-sm)] ${rose ? 'border-rose-200' : ''}`}
    >
      <p className={`text-sm uppercase tracking-wide ${rose ? 'text-rose-700' : 'text-ink/60'}`}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/60">{hint}</p>}
    </div>
  );
}
