type Props = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'rose';
};

export default function StatCard({ label, value, hint, tone = 'neutral' }: Props) {
  const rose = tone === 'rose';
  return (
    <div className={`rounded-xl border bg-surface p-4 shadow-sm ${rose ? 'border-rose-200' : ''}`}>
      <p className={`text-sm uppercase tracking-wide ${rose ? 'text-rose-700' : 'text-slate-500'}`}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
