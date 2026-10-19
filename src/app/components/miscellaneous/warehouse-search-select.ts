import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { WarehouseOption, WarehouseService } from '../../services/warehouse.service';

@Component({
  selector: 'app-warehouse-search-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './warehouse-search-select.html',
  styleUrls: ['./miscellaneous-form.css'],
})
export class WarehouseSearchSelectComponent implements OnInit, OnChanges, OnDestroy {
  private readonly warehouseService = inject(WarehouseService);
  private loadSub?: Subscription;

  @Input() warehouseCode = '';
  @Input() compact = false;
  @Input() displayCodeOnly = false;
  @Input() branchCode = '';
  @Input() placeholder = 'Select warehouse';
  @Output() warehouseCodeChange = new EventEmitter<string>();

  readonly options = signal<WarehouseOption[]>([]);
  readonly selectedCode = signal('');
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  private allOptions: WarehouseOption[] = [];

  ngOnInit(): void {
    this.selectedCode.set((this.warehouseCode ?? '').trim());
    this.loadOptions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['warehouseCode']) {
      this.selectedCode.set((this.warehouseCode ?? '').trim());
    }

    if (changes['branchCode'] && this.allOptions.length > 0) {
      this.options.set(this.filterOptionsForBranch(this.allOptions));
    }
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
  }

  onSelect(code: string): void {
    this.selectedCode.set(code);
    this.warehouseCodeChange.emit(code);
  }

  retryLoad(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.loadError.set(null);
    this.loadOptions(true);
  }

  optionLabel(warehouse: WarehouseOption): string {
    return this.warehouseService.formatLabel(warehouse);
  }

  private loadOptions(forceReload = false): void {
    this.loading.set(true);
    this.loadSub?.unsubscribe();
    const request = forceReload
      ? this.warehouseService.reload()
      : this.warehouseService.ensureLoaded();

    this.loadSub = request.subscribe({
      next: (rows) => {
        this.loading.set(false);
        this.allOptions = [...rows];
        this.options.set(this.filterOptionsForBranch(this.allOptions));
        this.loadError.set(rows.length === 0 ? 'No warehouses returned from API.' : null);

        // Keep a pre-filled PO warehouse visible even if catalog is still catching up.
        const code = this.selectedCode().trim();
        if (code && !this.options().some((row) => row.warehouseCode === code)) {
          this.options.set([
            { warehouseCode: code, warehouseName: code },
            ...this.options(),
          ]);
        }
      },
      error: () => {
        this.loading.set(false);
        this.options.set([]);
        this.loadError.set('Could not load warehouses from API.');
      },
    });
  }

  private filterOptionsForBranch(rows: WarehouseOption[]): WarehouseOption[] {
    const branchCode = (this.branchCode ?? '').trim().toLowerCase();
    if (!branchCode) {
      return rows;
    }

    const keywords: Record<string, string[]> = {
      '1': ['peshawar', 'psh'],
      '2': ['ho', 'head office', 'headoffice', 'head-office'],
      '3': ['faisalabad', 'fsd'],
    };

    const branchKeywords = keywords[branchCode] ?? [];
    return rows.filter((warehouse) => {
      const label = `${warehouse.warehouseCode} ${warehouse.warehouseName}`.toLowerCase();
      return branchKeywords.some((keyword) => label.includes(keyword));
    });
  }
}
