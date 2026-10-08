type Props = {
  label: string;
  value: string | number;
  hint?: string;
};

/** Angka dashboard: kartu potong dengan kop label + nilai tabular. */
export default function StatCard({ label, value, hint }: Props) {
  return (
    <div className="kartu lubang p-5">
      <p className="entri text-xs uppercase tracking-[0.05em] text-ink/70">{label}</p>
      <p className="entri mt-1 text-3xl font-bold text-heading">{value}</p>
      {hint && <p className="entri mt-1 text-xs text-ink/70">{hint}</p>}
    </div>
  );
}
