import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'PileScan · Find the sets in your pile',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'scan',
    pathMatch: 'full',
    title: 'Scan your pile · PileScan',
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
