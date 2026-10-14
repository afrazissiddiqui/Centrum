import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ReceiptFromProductionService } from './receipt-from-production.service';

describe('ReceiptFromProductionService', () => {
  let service: ReceiptFromProductionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    service = TestBed.inject(ReceiptFromProductionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps top-level production order item fields into order items when no line array is present', () => {
    const response = {
      data: [
        {
          DocEntry: '17',
          DocNum: '1',
          ItemCode: 'FG-Own-P-00000001',
          ProdName: 'Own Flint - Preform 15 Gram',
          PlannedQty: '4364363.000000',
          CmpltQty: '117221.000000',
          RjctQty: '0.000000',
          PostDate: '2026-06-28 00:00:00.0000000',
        },
      ],
    };

    service.listProductionOrders().subscribe((orders) => {
      expect(orders.length).toBe(1);
      expect(orders[0].items).toBeDefined();
      const matchedItem = orders[0].items?.find(
        (item) =>
          item.itemCode === 'FG-Own-P-00000001' &&
          item.itemDescription === 'Own Flint - Preform 15 Gram' &&
          item.quantity === 4364363,
      );
      expect(matchedItem).toBeDefined();
    });

    const req = httpMock.expectOne((request) => request.url.includes('production_orders'));
    expect(req.request.method).toBe('GET');
    req.flush(response);
  });

  it('maps U_NoJC from production order rows into the parsed item', () => {
    const response = {
      data: [
        {
          DocEntry: '18',
          DocNum: '2',
          ItemCode: 'FG-Own-P-00000002',
          ItemName: 'Own Flint - Preform 20 Gram',
          U_NoJC: '12000',
        },
      ],
    };

    service.listProductionOrders().subscribe((orders) => {
      expect(orders[0].items?.[0].jumboCartons).toBe(12000);
    });

    const req = httpMock.expectOne((request) => request.url.includes('production_orders'));
    expect(req.request.method).toBe('GET');
    req.flush(response);
  });

  it('uses the parent order U_NoJC value when line items do not carry it', () => {
    const response = {
      data: [
        {
          DocEntry: '19',
          DocNum: '3',
          ItemCode: 'FG-Own-P-00000003',
          ItemName: 'Own Flint - Preform 30 Gram',
          U_NoJC: '9',
          items: [
            {
              ItemCode: 'FG-Own-P-00000003',
              ItemName: 'Own Flint - Preform 30 Gram',
              Quantity: '5',
            },
          ],
        },
      ],
    };

    service.listProductionOrders().subscribe((orders) => {
      expect(orders[0].items?.[0].jumboCartons).toBe(9);
    });

    const req = httpMock.expectOne((request) => request.url.includes('production_orders'));
    expect(req.request.method).toBe('GET');
    req.flush(response);
  });

  it('accepts a single SAP object wrapped in value and exposes DocNum/DocEntry', () => {
    const response = {
      value: {
        DocEntry: '880',
        DocNum: '497',
        CardCode: 'CC-000003',
        CardName: 'Northern Bottling Company (Pvt) Limited',
        ItemCode: 'FG-Own-P-00000017',
        ProdName: 'Own Flint - Preform 19.5 Gram',
        PlannedQty: '739968.000000',
        CmpltQty: '739968.000000',
        RjctQty: '0.000000',
        PostDate: '2026-10-02 00:00:00.0000000',
      },
    };

    service.listProductionOrders().subscribe((orders) => {
      expect(orders.length).toBe(1);
      expect(orders[0].docEntry).toBe('880');
      expect(orders[0].docNum).toBe('497');
      expect(orders[0].customerCode).toBe('CC-000003');
      expect(orders[0].itemCode).toBe('FG-Own-P-00000017');
      expect(orders[0].itemDescription).toBe('Own Flint - Preform 19.5 Gram');
    });

    const req = httpMock.expectOne((request) => request.url.includes('production_orders'));
    expect(req.request.method).toBe('GET');
    req.flush(response);
  });

  it('maps receipt branch ids to friendly labels', () => {
    const response = {
      data: [
        { DocEntry: '1', DocNum: 'R-1', branch: '1', items: [] },
        { DocEntry: '2', DocNum: 'R-2', branch: '2', items: [] },
        { DocEntry: '3', DocNum: 'R-3', branch: '3', items: [] },
      ],
    };

    service.list().subscribe((rows) => {
      expect(rows.map((row) => row.branch)).toEqual(['Peshawar', 'HeadOffice', 'Faisalabad']);
    });

    const req = httpMock.expectOne((request) => request.url.includes('receipt_from_production'));
    expect(req.request.method).toBe('GET');
    req.flush(response);
  });
});
