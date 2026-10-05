import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PageToolbarComponent } from '../../../page-toolbar/page-toolbar';
import { PayrollMasterLayoutService } from '../payroll-master-layout.service';
import { PermissionService } from '../../../../services/permission.service';

@Component({
  selector: 'app-bonus',
  standalone: true,
  imports: [PageToolbarComponent],
  templateUrl: './bonus.html',
  styleUrl: '../../Application-Form/Application-Form.css',
  styles: [`
    .bonus-empty-state {
      display: grid;
      min-height: 220px;
      place-items: center;
      color: #64748b;
      text-align: center;
    }
  `],
})
export class BonusComponent {
  private readonly layout = inject(PayrollMasterLayoutService);
  private readonly router = inject(Router);
  private readonly permissionService = inject(PermissionService);

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }

  addBonus(): void {
    if (!this.permissionService.assertCan('tax_computation_form', 'add')) {
      return;
    }

    void this.router.navigateByUrl('/payroll-master/bonus/create');
  }
}