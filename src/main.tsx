import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { RouterProvider } from 'react-router/dom';
import { router } from './app/routes';
import { requestPersistence } from './data/db';
import './ui/design/theme.css';

void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* LazyMotion + `m` : seules les fonctions d'animation DOM sont chargées (bundle plus léger). */}
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
