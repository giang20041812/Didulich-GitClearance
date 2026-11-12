const PALETTE = [
  'bg-primary-50 text-primary',
  'bg-secondary/15 text-secondary-700',
  'bg-sun/15 text-amber-700',
  'bg-accent/15 text-primary-700',
  'bg-coral-light text-coral-hover',
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? '' : parts[0]?.charAt(1) ?? '';
  return (first + last).toUpperCase();
}

/** Avatar tròn: ảnh nếu có, không thì chữ cái đầu với màu cố định theo tên. */
export default function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-8 w-8 text-[11px]';
  if (src) {
    return <img src={src} alt="" referrerPolicy="no-referrer" className={`${dim} shrink-0 rounded-full object-cover ring-1 ring-border`} />;
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className={`${dim} ${PALETTE[hash % PALETTE.length]} flex shrink-0 items-center justify-center rounded-full font-bold`}>
      {initialsOf(name)}
    </span>
  );
}
