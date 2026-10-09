import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MiscellaneousLayoutService } from '../../miscellaneous/miscellaneous-layout.service';

@Component({
  selector: 'app-crushed-risen-consumption-list',
  templateUrl: './crushed-risen-consumption-list.html',
  styleUrls: ['../../miscellaneous/miscellaneous-list.css', '../../sample-inspection-request/sample-inspection-request.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrushedRisenConsumptionListComponent {
  private readonly router = inject(Router);
  protected readonly layout = inject(MiscellaneousLayoutService);

  addRecord(): void {
    void this.router.navigateByUrl('/miscellaneous/crushed-risen-consumption/create');
  }
}
