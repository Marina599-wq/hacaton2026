import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'gray' | 'green' | 'red' | 'blue' | 'amber' | 'violet';

const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  violet: 'bg-violet-100 text-violet-700',
};

export function Badge({
  tone = 'gray',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}
