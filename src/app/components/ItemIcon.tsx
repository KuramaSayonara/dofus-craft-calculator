import { iconUrl, type SearchEntry } from '../data.ts';

export function ItemIcon({ icon, size = 8 }: { icon: SearchEntry['i']; size?: 8 | 10 }) {
  const url = iconUrl(icon);
  const cls = size === 10 ? 'h-10 w-10' : 'h-8 w-8';
  if (url === null) return <div aria-hidden className={`${cls} shrink-0 rounded bg-zinc-800`} />;
  return <img src={url} alt="" loading="lazy" className={`${cls} shrink-0 rounded bg-zinc-800/60 object-contain`} />;
}
