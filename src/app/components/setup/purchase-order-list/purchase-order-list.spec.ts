import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { OpenBaseDocumentsService } from '../../gate-pass/open-base-documents.service';
import { PurchaseOrderListComponent } from './purchase-order-list';

describe('PurchaseOrderListComponent', () => {
  it('shows SAP DocNum as the order number when the API response uses uppercase SAP field names', () => {
    const component = Object.create(PurchaseOrderListComponent.prototype) as any;
    component.asString = PurchaseOrderListComponent.prototype['asString'];
    component.toNumber = PurchaseOrderListComponent.prototype['toNumber'];

    const mapped = component.mapOpenDocumentToListItem({
      number: '',
      DocNum: '129',
      DocDate: '2026-09-25',
      CardName: 'Demo Vendor',
      status: 'O',
      remarks: 'Priority',
      lines: [],
    });

    expect(mapped.docNum).toBe('129');
    expect(mapped.docDate).toBe('25/09/2026');
    expect(mapped.vendor).toBe('Demo Vendor');
  });

  it('maps service request line fields for the service-specific view details', () => {
    const documentsService = Object.create(OpenBaseDocumentsService.prototype) as any;
    const listComponent = Object.create(PurchaseOrderListComponent.prototype) as any;
    listComponent.asString = PurchaseOrderListComponent.prototype['asString'];
    listComponent.toNumber = PurchaseOrderListComponent.prototype['toNumber'];

    const document = documentsService.mapApiRecordToOpenBaseDocument({
      Document: {
        DocNum: 'PR-1002',
        DocType: 'S',
        DocumentLines: [{
          Dscription: 'Equipment maintenance',
          Vendor: 'Service Vendor',
          Department: 'Maintenance',
          AccountCode: '6100',
          TaxCode: 'VAT15',
          RequiredDate: '2026-10-15',
          total: '1250',
        }],
      },
    });
    const row = listComponent.mapOpenDocumentToListItem(document);

    expect(row.docNum).toBe('PR-1002');
    expect(row.docType).toBe('S');
    expect(row.itemCount).toBe(1);
    expect(row.items[0].itemDescription).toBe('Equipment maintenance');
    expect(row.items[0].vendor).toBe('Service Vendor');
    expect(row.items[0].department).toBe('Maintenance');
    expect(row.items[0].glAccount).toBe('6100');
    expect(row.items[0].taxCode).toBe('VAT15');
    expect(row.items[0].requiredDate).toBe('2026-10-15');
    expect(row.items[0].lineTotal).toBe(1250);
  });

});
