import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GatePassItemMaster, GatePassItemMasterService } from '../gate-pass-item-master.service';

@Component({
  selector: 'app-gate-pass-item-search-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-search-input.html',
  styleUrl: './item-search-input.css',
})
export class GatePassItemSearchInputComponent {
  private readonly itemMaster = inject(GatePassItemMasterService);

  @Input() value = '';
  @Input() placeholder = 'Search code or name';
  @Input() inputId = '';
  @Input() displayMode?: 'code' | 'name';
  @Input() disabled = false;

  @Output() valueChange = new EventEmitter<string>();
  @Output() itemSelected = new EventEmitter<GatePassItemMaster>();
  @Output() editAttempt = new EventEmitter<void>();

  suggestionsOpen = false;
  suggestions: GatePassItemMaster[] = [];
  loadingSuggestions = false;
  suggestionStyle: Record<string, string> | null = null;

  private onWindowChange = () => this.updateSuggestionPosition();

  onInput(next: string): void {
    if (this.disabled) {
      return;
    }
    this.valueChange.emit(next);
    this.refreshSuggestions(next);
  }

  openSuggestions(): void {
    if (this.disabled) {
      return;
    }
    this.editAttempt.emit();
    if (this.value.trim()) {
      this.refreshSuggestions(this.value);
      // compute position for suggestions to avoid clipping
      this.updateSuggestionPosition();
    }
  }

  onBlur(): void {
    setTimeout(() => {
      this.suggestionsOpen = false;
      this.stopTrackingPosition();
    }, 150);
  }

  selectItem(item: GatePassItemMaster): void {
    if (this.disabled) {
      return;
    }
    // Update the visible value immediately so the input shows the selected item
    // Prefer explicit `displayMode` input; fall back to inputId heuristic
    const displayValue = (this.displayMode
      ? this.displayMode === 'code'
      : String(this.inputId || '').toLowerCase().includes('-code'))
      ? item.itemCode
      : item.itemName;
    this.value = displayValue;
    this.valueChange.emit(displayValue);
    this.itemSelected.emit(item);
    this.suggestionsOpen = false;
    this.suggestionStyle = null;
    this.stopTrackingPosition();
  }

  private refreshSuggestions(query: string): void {
    if (!query.trim()) {
      this.suggestions = [];
      this.suggestionsOpen = false;
      this.loadingSuggestions = false;
      this.stopTrackingPosition();
      return;
    }

    this.suggestionsOpen = true;
    this.loadingSuggestions = true;
    this.updateSuggestionPosition();
    window.addEventListener('scroll', this.onWindowChange, true);
    window.addEventListener('resize', this.onWindowChange);
    this.itemMaster.ensureLoaded().subscribe({
      next: () => {
        this.suggestions = this.itemMaster.search(query);
        this.loadingSuggestions = false;
        this.updateSuggestionPosition();
      },
      error: () => {
        this.suggestions = [];
        this.loadingSuggestions = false;
      },
    });
  }

  private stopTrackingPosition(): void {
    window.removeEventListener('scroll', this.onWindowChange, true);
    window.removeEventListener('resize', this.onWindowChange);
  }

  private updateSuggestionPosition(): void {
    if (!this.suggestionsOpen) {
      return;
    }

    const id = this.inputId;
    if (!id) {
      this.suggestionStyle = null;
      return;
    }

    const inputEl = document.getElementById(id);
    if (!inputEl) {
      this.suggestionStyle = null;
      return;
    }

    const rect = inputEl.getBoundingClientRect();
    this.suggestionStyle = {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.bottom + 2}px`,
      width: `${rect.width}px`,
      zIndex: '10050',
    };
  }

  // Clean up listeners when component destroyed (optional: Angular standalone no OnDestroy here)
  // Provide a simple removal method bound to window unload to be safe
  constructor() {
    window.addEventListener('beforeunload', () => {
      this.stopTrackingPosition();
    });
  }
}
