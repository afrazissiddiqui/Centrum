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
          Warehouse: 'SERVICE-WH',
          Remarks: 'Service line remarks',
          total: '1250',
        }, {
          Dscription: 'Replacement parts',
          total: '250',
        }],
      },
    });
    const row = listComponent.mapOpenDocumentToListItem(document);

    expect(row.docNum).toBe('PR-1002');
    expect(row.docType).toBe('S');
    expect(row.itemCount).toBe(2);
    expect(row.total).toBe(1500);
    expect(row.items[0].itemDescription).toBe('Equipment maintenance');
    expect(row.items[0].vendor).toBe('Service Vendor');
    expect(row.items[0].department).toBe('Maintenance');
    expect(row.items[0].glAccount).toBe('6100');
    expect(row.items[0].taxCode).toBe('VAT15');
    expect(row.items[0].requiredDate).toBe('2026-10-15');
    expect(row.items[0].warehouse).toBe('SERVICE-WH');
    expect(row.items[0].remarks).toBe('Service line remarks');
    expect(row.items[0].lineTotal).toBe(1250);
  });

  it('maps the item request fields shown in the detail modal', () => {
    const documentsService = Object.create(OpenBaseDocumentsService.prototype) as any;
    const listComponent = Object.create(PurchaseOrderListComponent.prototype) as any;
    listComponent.asString = PurchaseOrderListComponent.prototype['asString'];
    listComponent.toNumber = PurchaseOrderListComponent.prototype['toNumber'];

    const document = documentsService.mapApiRecordToOpenBaseDocument({
      DocNum: 'PR-1003',
      DocType: 'I',
      CardName: 'Request Vendor',
      WhsCode: 'ITEM-WH',
      Comments: 'Header remarks',
      DocumentLines: [{
        ItemCode: 'ITEM-01',
        ItemName: 'Requested item',
        Vendor: 'Line Vendor',
        Department: 'Operations',
        TaxCode: 'VAT5',
        RequiredDate: '2026-10-20',
        WhsCode: 'LINE-WH',
        Remarks: 'Line remarks',
        Quantity: 2,
        UnitPrice: 150,
      }],
    });
    const row = listComponent.mapOpenDocumentToListItem(document);

    expect(row.remarks).toBe('Header remarks');
    expect(row.warehouse).toBe('ITEM-WH');
    expect(row.items[0]).toMatchObject({
      itemCode: 'ITEM-01',
      vendor: 'Line Vendor',
      department: 'Operations',
      taxCode: 'VAT5',
      requiredDate: '2026-10-20',
      warehouse: 'LINE-WH',
      remarks: 'Line remarks',
    });
  });

  it('builds a printable purchase request with escaped document and line-item content', () => {
    const component = Object.create(PurchaseOrderListComponent.prototype) as any;
    component.formatAmount = PurchaseOrderListComponent.prototype.formatAmount;
    component.statusLabel = PurchaseOrderListComponent.prototype.statusLabel;
    component.normalizeStatus = PurchaseOrderListComponent.prototype['normalizeStatus'];

    const document = PurchaseOrderListComponent.prototype['buildPurchaseRequestPrintDocument'].call(component, {
      docNum: 'PR-<100>',
      docDate: '22/10/2026',
      docType: 'I',
      vendor: 'Vendor & Sons',
      warehouse: 'WH-1',
      itemCount: 1,
      total: 25,
      status: 'O',
      remarks: '',
      items: [{
        itemCode: 'ITEM-1',
        itemDescription: '<script>alert(1)</script>',
        vendor: '',
        department: '',
        glAccount: '',
        taxCode: '',
        requiredDate: '',
        warehouse: '',
        remarks: '',
        quantity: 1,
        unitPrice: 25,
        lineTotal: 25,
      }],
    });

    expect(document).toContain('Purchase Request #PR-&lt;100&gt;');
    expect(document).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(document).toContain('Vendor &amp; Sons');
    expect(document).not.toContain('<script>alert(1)</script>');
  });

});
