import { createBrowserRouter } from 'react-router';
import { AppShell } from './AppShell';
import { Today } from '@/ui/screens/Today';
import { Settings } from '@/ui/screens/Settings';
import { Placeholder } from '@/ui/screens/Placeholder';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Today /> },
      { path: 'plan', lazy: async () => ({ Component: (await import('@/ui/screens/Plan')).Plan }) },
      { path: 'seance/:id', lazy: async () => ({ Component: (await import('@/ui/screens/SessionDetail')).SessionDetail }) },
      { path: 'importer', lazy: async () => ({ Component: (await import('@/ui/screens/Import')).Import }) },
      { path: 'activite/:id', lazy: async () => ({ Component: (await import('@/ui/screens/ActivityDebrief')).ActivityDebrief }) },
      { path: 'progres', lazy: async () => ({ Component: (await import('@/ui/screens/Progress')).Progress }) },
      { path: 'corps', lazy: async () => ({ Component: (await import('@/ui/screens/Body')).Body }) },
      { path: 'plus', element: <Settings /> },
      { path: 'sante', lazy: async () => ({ Component: (await import('@/ui/screens/Health')).Health }) },
      { path: 'profil', lazy: async () => ({ Component: (await import('@/ui/screens/Profile')).Profile }) },
      { path: 'connexion', lazy: async () => ({ Component: (await import('@/ui/screens/Login')).Login }) },
      { path: 'objectif', lazy: async () => ({ Component: (await import('@/ui/screens/NewGoal')).NewGoal }) },
      { path: 'communaute', lazy: async () => ({ Component: (await import('@/ui/screens/Community')).Community }) },
      { path: 'coach', lazy: async () => ({ Component: (await import('@/ui/screens/Coach')).Coach }) },
      { path: 'coach/:athleteId', lazy: async () => ({ Component: (await import('@/ui/screens/Coach')).CoachAthlete }) },
      { path: 'design', lazy: async () => ({ Component: (await import('@/ui/screens/DesignSystem')).DesignSystem }) },
      { path: '*', element: <Placeholder title="Perdu en forêt" text="Cette page n'existe pas. Reviens sur le sentier balisé." /> },
    ],
  },
]);
