import { charms, type Charm } from '@/features/things/model';

export function CharmIcon({ charm, size = 96, className = '' }: { charm: Charm | null; size?: number; className?: string }) {
  if (!charm) return <span className={`inline-grid place-items-center text-muted ${className}`} style={{ width: size, height: size }} aria-hidden="true">○</span>;
  const item = charms[charm];
  // These are tiny local SVG identity assets; keeping their intrinsic SVG
  // rendering avoids raster optimization and preserves the sticker linework.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.assetPath} width={size} height={size} alt={item.label} className={className} />;
}

export function thingDisplayName(thing: Pick<import('@/features/things/model').ThingSnapshot, 'nickname' | 'members'>) {
  return thing.nickname?.trim() || thing.members.map((member) => member.display_name).join(' + ');
}
