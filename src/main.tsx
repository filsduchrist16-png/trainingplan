import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig } from 'motion/react';
import { RouterProvider } from 'react-router/dom';
import { router } from './app/routes';
import { db, requestPersistence } from './data/db';
import { installSyncHooks } from './data/sync';
import { cloudConfigured } from './data/cloud/config';
import './ui/design/theme.css';

installSyncHooks(db);
void requestPersistence();
// Comptes et synchro : client Supabase chargé seulement s'il est configuré.
if (cloudConfigured) void import('./data/cloud/session').then((m) => m.startCloud());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* LazyMotion + `m` : les fonctions d'animation DOM se chargent après le premier rendu (bundle initial plus léger). */}
    <LazyMotion features={() => import('./ui/design/motionFeatures').then((m) => m.default)} strict>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
