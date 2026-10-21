import { createBrowserRouter } from 'react-router';
import { AppShell } from './AppShell';
import { Today } from '@/ui/screens/Today';
import { Settings } from '@/ui/screens/Settings';
import { Placeholder } from '@/ui/screens/Placeholder';
import { t } from '@/ui/lib/strings';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Today /> },
      { path: 'plan', element: <Placeholder title="Plan" text={t.empty.plan} /> },
      { path: 'progres', element: <Placeholder title="Progrès" text={t.empty.progress} /> },
      { path: 'corps', element: <Placeholder title="Corps" text="Journal de douleur, red flags et routine de prévention." /> },
      { path: 'plus', element: <Settings /> },
      { path: 'communaute', lazy: async () => ({ Component: (await import('@/ui/screens/Community')).Community }) },
      { path: 'coach', lazy: async () => ({ Component: (await import('@/ui/screens/Coach')).Coach }) },
      { path: 'coach/:athleteId', lazy: async () => ({ Component: (await import('@/ui/screens/Coach')).CoachAthlete }) },
      { path: 'design', lazy: async () => ({ Component: (await import('@/ui/screens/DesignSystem')).DesignSystem }) },
      { path: '*', element: <Placeholder title="Perdu en forêt" text="Cette page n'existe pas. Reviens sur le sentier balisé." /> },
    ],
  },
]);
