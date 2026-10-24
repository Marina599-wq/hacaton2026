import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'gray' | 'green' | 'red' | 'blue' | 'amber' | 'violet';

const TONES: Record<Tone, string> = {
  gray: 'bg-slate-800 text-slate-300',
  green: 'bg-emerald-500/15 text-emerald-400',
  red: 'bg-rose-500/15 text-rose-400',
  blue: 'bg-sky-500/15 text-sky-300',
  amber: 'bg-amber-500/15 text-amber-300',
  violet: 'bg-violet-500/15 text-violet-300',
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
