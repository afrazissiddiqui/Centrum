import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { PageToolbarComponent } from '../../page-toolbar/page-toolbar';
import { MiscellaneousLayoutService } from '../../miscellaneous/miscellaneous-layout.service';

interface CrushedRisenConsumptionHeader {
  series: string;
  signedUser: string;
  remark: string;
  itemNameFromProduction: string;
  documentNumberFromProduction: string;
  cancel: '' | 'Yes' | 'No';
  status: string;
  itemCodeFromProduction: string;
  productDocEntry: string;
}

type CrushedRisenConsumptionHeaderField = Exclude<keyof CrushedRisenConsumptionHeader, 'signedUser' | 'status'>;

interface CrushedRisenConsumptionLine {
  machineId: string;
  machineName: string;
  moldNumberFromProductionOrder: string;
  cavityNumberFromProductionOrder: string;
  employeeShift: string;
  crushedRisenConsumption: number | null;
}

@Component({
  selector: 'app-crushed-risen-consumption',
  imports: [CommonModule, FormsModule, PageToolbarComponent],
  templateUrl: './crushed-risen-consumption.html',
  styleUrl: '../../miscellaneous/miscellaneous-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrushedRisenConsumptionComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  protected readonly layout = inject(MiscellaneousLayoutService);

  readonly headerForm = signal<CrushedRisenConsumptionHeader>({
    series: '',
    signedUser: this.authService.getSessionUser()?.name ?? '',
    remark: '',
    itemNameFromProduction: '',
    documentNumberFromProduction: '',
    cancel: '',
    status: '',
    itemCodeFromProduction: '',
    productDocEntry: '',
  });
  readonly contentLines = signal<CrushedRisenConsumptionLine[]>([this.createEmptyLine()]);

  updateHeaderField<K extends CrushedRisenConsumptionHeaderField>(
    field: K,
    value: CrushedRisenConsumptionHeader[K],
  ): void {
    this.headerForm.update((header) => ({ ...header, [field]: value }));
  }

  updateContentLine<K extends keyof CrushedRisenConsumptionLine>(
    index: number,
    field: K,
    value: CrushedRisenConsumptionLine[K],
  ): void {
    this.contentLines.update((lines) =>
      lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)),
    );
  }

  addContentLine(): void {
    this.contentLines.update((lines) => [...lines, this.createEmptyLine()]);
  }

  deleteContentLine(index: number): void {
    this.contentLines.update((lines) =>
      lines.length > 1 ? lines.filter((_, lineIndex) => lineIndex !== index) : lines,
    );
  }

  private createEmptyLine(): CrushedRisenConsumptionLine {
    return {
      machineId: '',
      machineName: '',
      moldNumberFromProductionOrder: '',
      cavityNumberFromProductionOrder: '',
      employeeShift: '',
      crushedRisenConsumption: null,
    };
  }

  backToPurchaseRequest(): void {
    void this.router.navigateByUrl('/miscellaneous/crushed-risen-consumption');
  }
}
