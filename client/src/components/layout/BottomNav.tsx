import { NavLink } from 'react-router-dom';
import { CalendarDays, CreditCard, FlaskConical, History, Home, LifeBuoy } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/payments', label: 'Оплата', icon: CreditCard },
  { to: '/history', label: 'История', icon: History },
  { to: '/support', label: 'Поддержка', icon: LifeBuoy },
  { to: '/sandbox', label: 'Песочница', icon: FlaskConical },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-5xl grid-cols-6">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600',
              )
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
