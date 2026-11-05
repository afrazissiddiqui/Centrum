import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { GatePassShellComponent } from './gate-pass-shell';
import { IgpComponent } from './igp/igp';
import { CreateIgpComponent } from './igp/create-igp/create-igp';
import { OgpComponent } from './ogp/ogp';
import { CreateOgpComponent } from './ogp/create-ogp/create-ogp';
import { AgpComponent } from './agp/agp';
import { CreateAgpComponent } from './agp/create-agp/create-agp';
import { requireAccess, requirePermission } from '../../guards/permission.guard';
import { GatePassRedirectComponent } from './gate-pass-redirect';
import { AlertService } from '../../services/alert.service';

function showGatePassUnderConstruction(): false {
  inject(AlertService).error('Error', 'Under Construction');
  return false;
}

export const gatePassRoutes: Routes = [
  {
    path: 'gate-pass',
    component: GatePassShellComponent,
    canActivate: [
      requireAccess(
        {
          anyOf: [
            { moduleSlug: 'igp_form', action: 'list' },
            { moduleSlug: 'igp_form', action: 'add' },
            { moduleSlug: 'igp_form', action: 'update' },
            { moduleSlug: 'ogp_form', action: 'list' },
            { moduleSlug: 'ogp_form', action: 'add' },
            { moduleSlug: 'ogp_form', action: 'update' },
            { moduleSlug: 'agp_form', action: 'list' },
            { moduleSlug: 'agp_form', action: 'add' },
            { moduleSlug: 'agp_form', action: 'update' },
          ],
        },
        'igp_form',
        'list',
      ),
      showGatePassUnderConstruction,
    ],
    canActivateChild: [showGatePassUnderConstruction],
    children: [
      { path: '', pathMatch: 'full', component: GatePassRedirectComponent },
      { path: 'igp', component: IgpComponent, canActivate: [requirePermission('igp_form', 'list')] },
      { path: 'igp/create', component: CreateIgpComponent, canActivate: [requirePermission('igp_form', 'add')] },
      { path: 'igp/edit/:id', component: CreateIgpComponent, canActivate: [requirePermission('igp_form', 'update')] },
      { path: 'ogp', component: OgpComponent, canActivate: [requirePermission('ogp_form', 'list')] },
      { path: 'ogp/create', component: CreateOgpComponent, canActivate: [requirePermission('ogp_form', 'add')] },
      { path: 'ogp/edit/:id', component: CreateOgpComponent, canActivate: [requirePermission('ogp_form', 'update')] },
      { path: 'agp', component: AgpComponent, canActivate: [requirePermission('agp_form', 'list')] },
      { path: 'agp/create', component: CreateAgpComponent, canActivate: [requirePermission('agp_form', 'add')] },
      { path: 'agp/edit/:id', component: CreateAgpComponent, canActivate: [requirePermission('agp_form', 'update')] },
    ],
  },
  { path: 'igp', redirectTo: 'gate-pass/igp', pathMatch: 'full' },
  { path: 'igp/create', redirectTo: 'gate-pass/igp/create', pathMatch: 'full' },
  { path: 'igp/edit/:id', redirectTo: 'gate-pass/igp/edit/:id', pathMatch: 'full' },
  { path: 'ogp', redirectTo: 'gate-pass/ogp', pathMatch: 'full' },
  { path: 'ogp/create', redirectTo: 'gate-pass/ogp/create', pathMatch: 'full' },
  { path: 'ogp/edit/:id', redirectTo: 'gate-pass/ogp/edit/:id', pathMatch: 'full' },
  { path: 'agp', redirectTo: 'gate-pass/agp', pathMatch: 'full' },
  { path: 'agp/create', redirectTo: 'gate-pass/agp/create', pathMatch: 'full' },
  { path: 'agp/edit/:id', redirectTo: 'gate-pass/agp/edit/:id', pathMatch: 'full' },
];
