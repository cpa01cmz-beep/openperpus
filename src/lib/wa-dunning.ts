export function formatRp(n: number): string {
  return `Rp${(n ?? 0).toLocaleString('id-ID')}`;
}

export function buildDunningMessage(args: {
  title: string;
  dueAt: string;
  fine: number;
  memberCode?: string;
  loanId?: string;
  lateDays?: number;
}): string {
  const head = `Halo, denda ${formatRp(args.fine)} untuk ${args.title} jatuh tempo ${args.dueAt}.`;
  const tail =
    args.memberCode || args.loanId
      ? ` Detail: ${[args.loanId ? `ID ${args.loanId}` : '', args.memberCode ? `anggota ${args.memberCode}` : '', typeof args.lateDays === 'number' ? `telat ${args.lateDays} hari` : ''].filter(Boolean).join(' · ')}.`
      : '';
  return `${head}${tail} Mohon segera dikembalikan ke perpustakaan. Terima kasih.`;
}

export function buildWaDunningUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildCopyPayload(args: {
  loanId: string;
  memberCode: string;
  title: string;
  dueAt: string;
  lateDays: number;
  fine: number;
}): string {
  return [
    `ID loan: ${args.loanId}`,
    `member_code: ${args.memberCode}`,
    `title: ${args.title}`,
    `due_at: ${args.dueAt}`,
    `telat ${args.lateDays} hari`,
    `denda: ${formatRp(args.fine)}`,
  ].join('\n');
}
