import { Routes } from '@angular/router';
import { guardiaSesion } from 'shared';

export const rutas: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'bandeja' },
  {
    path: 'ingreso',
    title: 'Identificarse · BanQuito',
    loadComponent: () => import('./paginas/ingreso').then((m) => m.Ingreso),
  },
  {
    path: 'bandeja',
    canActivate: [guardiaSesion('/ingreso')],
    title: 'Bandeja de solicitudes · BanQuito',
    loadComponent: () => import('./paginas/bandeja').then((m) => m.Bandeja),
  },
  {
    path: 'operaciones',
    canActivate: [guardiaSesion('/ingreso')],
    title: 'Operaciones · BanQuito',
    loadComponent: () => import('./paginas/operaciones').then((m) => m.Operaciones),
  },
  {
    path: 'operaciones/:numero',
    canActivate: [guardiaSesion('/ingreso')],
    title: 'Detalle de operación · BanQuito',
    loadComponent: () => import('./paginas/operacion').then((m) => m.Operacion),
  },
  {
    path: 'cierre',
    canActivate: [guardiaSesion('/ingreso')],
    title: 'Cierre de día · BanQuito',
    loadComponent: () => import('./paginas/cierre').then((m) => m.Cierre),
  },
  {
    path: 'reportes',
    canActivate: [guardiaSesion('/ingreso')],
    title: 'Reportes de cartera · BanQuito',
    loadComponent: () => import('./paginas/reportes').then((m) => m.Reportes),
  },
  {
    path: 'parametros',
    canActivate: [guardiaSesion('/ingreso')],
    title: 'Parámetros y tramos · BanQuito',
    loadComponent: () => import('./paginas/parametros').then((m) => m.Parametros),
  },
  { path: '**', redirectTo: 'bandeja' },
];
