import type { CSSProperties, ReactNode } from 'react';
import { thingColors, type ThingColor } from '@/features/things/model';

const lightTextColors = new Set<ThingColor>(['cherry', 'electric_blue', 'purple', 'ink']);

export function ThingTheme({ color, children, className = '' }: { color: ThingColor; children: ReactNode; className?: string }) {
  const style = {
    '--thing-primary': thingColors[color],
    '--thing-on-primary': lightTextColors.has(color) ? '#FFFDF8' : '#171717',
  } as CSSProperties;
  return <div className={`thing-theme ${className}`} style={style}>{children}</div>;
}
