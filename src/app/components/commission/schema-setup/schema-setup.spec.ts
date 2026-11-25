import { TestBed } from '@angular/core/testing';
import { SchemaSetupComponent } from './schema-setup';

describe('SchemaSetupComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemaSetupComponent],
    }).compileComponents();
  });

  it('updates the selected scheme without adding another row', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    const original = component.schemes()[0];

    component.editScheme(original);
    component.draft.code = 'SCH-SLS-UPDATED';
    component.saveScheme();

    expect(component.schemes()).toHaveSize(5);
    expect(component.schemes().find((scheme) => scheme.id === original.id)?.code).toBe(
      'SCH-SLS-UPDATED',
    );
    expect(component.notice()).toBe('SCH-SLS-UPDATED saved successfully.');
  });

  it('blocks overlapping active schemes when prevention is enabled', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    component.draft.code = 'SCH-SLS-02';
    component.draft.effectiveFrom = '2026-07-01';
    component.draft.rate = 2.5;

    component.saveScheme();

    expect(component.schemes()).toHaveSize(5);
    expect(component.notice()).toContain('overlaps this branch and date range');
  });
});
