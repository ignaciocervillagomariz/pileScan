import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'PileScan',
    loadComponent: () => import('./features/capture/capture.page').then((m) => m.CapturePage),
  },
  {
    path: 'scan/:id',
    title: 'Review pieces · PileScan',
    loadComponent: () => import('./features/review/review.page').then((m) => m.ReviewPage),
  },
  {
    path: 'scan/:id/results',
    title: 'Matching sets · PileScan',
    loadComponent: () => import('./features/results/results.page').then((m) => m.ResultsPage),
  },
  { path: '**', redirectTo: '' },
];
