import { NavLink, Outlet } from 'react-router';
import { cn } from '@/ui/lib/cn';
import { t } from '@/ui/lib/strings';
import { UpdatePrompt } from './UpdatePrompt';
import { versionLabel } from './buildInfo';

const tabs = [
  { to: '/', label: t.nav.today, icon: SunIcon, end: true },
  { to: '/plan', label: t.nav.plan, icon: CalendarIcon },
  { to: '/progres', label: t.nav.progress, icon: ChartIcon },
  { to: '/corps', label: t.nav.body, icon: HeartIcon },
  { to: '/plus', label: t.nav.more, icon: DotsIcon },
];

export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink">
        Aller au contenu
      </a>
      <main id="contenu" className="flex-1 px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Outlet />
        <footer className="num mt-10 text-center text-[11px] text-muted" aria-label="Version de l'app">{versionLabel()}</footer>
      </main>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/90 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition', isActive ? 'text-accent' : 'text-muted hover:text-text')
                }
              >
                <Icon />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <UpdatePrompt />
    </div>
  );
}

const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
function SunIcon() {
  return <svg {...iconProps}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}
function CalendarIcon() {
  return <svg {...iconProps}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
}
function ChartIcon() {
  return <svg {...iconProps}><path d="M3 19 9 12l4 4 8-10" /><path d="M3 21h18" /></svg>;
}
function HeartIcon() {
  return <svg {...iconProps}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>;
}
function DotsIcon() {
  return <svg {...iconProps}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>;
}
