import { CommonModule } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import {
  ApplicationFormAttachmentMeta,
  ApplicationFormRecord,
  ApplicationFormRemuneration,
  ApplicationFormService,
} from '../../../../services/application-form.service';
import { displayDateOnly } from '../../../../utils/date-format.util';
import { glAccountBranchLabel } from '../../../setup/gl-account-determination/gl-account-branch.options';

@Component({
  selector: 'app-application-detail-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './application-detail-dialog.html',
  styleUrl: '../Application-Form.css',
})
export class ApplicationDetailDialogComponent {
  readonly open = input(false);
  readonly loading = input(false);
  readonly record = input<ApplicationFormRecord | null>(null);

  readonly closed = output<void>();

  private readonly applicationFormService = inject(ApplicationFormService);

  close(): void {
    this.closed.emit();
  }

  displayDash(value: string | number | undefined | null): string {
    if (value === undefined || value === null) {
      return '—';
    }
    const s = String(value).trim();
    return s === '' ? '—' : s;
  }

  private parseCurrencyNumber(value: string | number | undefined | null): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const sanitized = String(value).replace(/,/g, '').trim();
    if (!sanitized) {
      return null;
    }
    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatCurrencyNumber(value: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  displayBankSalaryPercentage(remuneration: ApplicationFormRemuneration): string {
    const explicit = remuneration.taxPercentage?.trim();
    if (explicit) {
      return this.displayDash(explicit);
    }
    const bankPercent = this.parseCurrencyNumber(remuneration.taxPercentage);
    const cashPercent = this.parseCurrencyNumber(remuneration.cashSalaryPercentage);
    if (bankPercent !== null && cashPercent !== null) {
      return this.displayDash(String(bankPercent));
    }
    if (cashPercent !== null) {
      return this.displayDash(String(100 - cashPercent));
    }
    return '—';
  }

  displayCashSalaryPercentage(remuneration: ApplicationFormRemuneration): string {
    const explicit = remuneration.cashSalaryPercentage?.trim();
    if (explicit) {
      return this.displayDash(explicit);
    }
    const bankPercent = this.parseCurrencyNumber(remuneration.taxPercentage);
    if (bankPercent !== null) {
      const remaining = Math.max(0, 100 - bankPercent);
      return this.displayDash(String(remaining));
    }
    return '—';
  }

  displayBankSalaryAmount(remuneration: ApplicationFormRemuneration): string {
    const salary = this.parseCurrencyNumber(remuneration.basicSalary);
    const bankPercent = this.parseCurrencyNumber(remuneration.taxPercentage);
    if (salary === null || bankPercent === null) {
      return '—';
    }
    const amount = (salary * bankPercent) / 100;
    return this.displayDash(this.formatCurrencyNumber(amount));
  }

  displayCashSalaryAmount(remuneration: ApplicationFormRemuneration): string {
    const salary = this.parseCurrencyNumber(remuneration.basicSalary);
    const bankPercent = this.parseCurrencyNumber(remuneration.taxPercentage);
    if (salary === null || bankPercent === null) {
      return '—';
    }
    const amount = salary - (salary * bankPercent) / 100;
    return this.displayDash(this.formatCurrencyNumber(amount));
  }

  branchLabel(code: string | undefined | null): string {
    const label = glAccountBranchLabel(code ?? '');
    return label ? this.displayDash(label) : this.displayDash(code);
  }

  resolveAttachmentFor(attachment: ApplicationFormAttachmentMeta): string {
    return this.applicationFormService.resolveAttachmentForLabel(attachment);
  }

  attachmentViewUrl(attachment: ApplicationFormAttachmentMeta, download = false): string {
    return this.applicationFormService.getEmployeeAttachmentViewUrl(attachment, download);
  }

  displayMaximumLoanCapacity(remuneration: ApplicationFormRemuneration): string {
    const value =
      remuneration.loanAmountAllowed?.trim() || remuneration.maximumLoanCapacity?.trim() || '';
    return this.displayDash(value);
  }

  displayMaximumAdvanceCapacity(remuneration: ApplicationFormRemuneration): string {
    return this.displayDash(this.applicationFormService.resolveMaximumAdvanceCapacity(remuneration));
  }

  displayDate(value: string | number | undefined | null): string {
    return displayDateOnly(value);
  }

  maskedPassword(password: string | undefined): string {
    if (!password || !String(password).trim()) {
      return '—';
    }
    return '••••••••';
  }
}
