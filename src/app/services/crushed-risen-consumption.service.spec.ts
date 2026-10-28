import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiUrl } from '../config/api.config';
import {
  CrushedRisenConsumptionDetail,
  CrushedRisenConsumptionRecord,
  CrushedRisenConsumptionService,
} from './crushed-risen-consumption.service';

describe('CrushedRisenConsumptionService', () => {
  let service: CrushedRisenConsumptionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CrushedRisenConsumptionService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(CrushedRisenConsumptionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches and maps Crushed Risen Consumption records', () => {
    let records: CrushedRisenConsumptionRecord[] | undefined;

    service.fetchRecords().subscribe((result) => {
      records = result;
    });

    const request = httpMock.expectOne(apiUrl('crushed-risen-consumption-list'));
    expect(request.request.method).toBe('GET');
    request.flush({
      status: true,
      message: 'Crushed Risen Consumption records retrieved successfully',
      total: 1,
      data: [
        {
          id: 6,
          doc_num_po: '100234',
          item_code: 'RM-0012',
          item_name: 'Crushed Resin Material',
          status: 'Open',
        },
      ],
    });

    expect(records).toEqual([
      {
        id: 6,
        documentNumberFromProduction: '100234',
        itemCodeFromProduction: 'RM-0012',
        itemNameFromProduction: 'Crushed Resin Material',
        status: 'Open',
      },
    ]);
  });

  it('posts a new Crushed Risen Consumption record', () => {
    const payload = {
      docNumPo: '100234',
      docEntryPo: '542',
      itemCode: 'RM-0012',
      itemName: 'Crushed Resin Material',
      crcNumber: 'CRC-000001',
      series: 24,
      status: 'Open',
      userSigned: 'Admin',
      remark: 'Test consumption from production order',
      createDate: '2026-10-26',
      createTime: '11:18 AM',
      lines: [
        {
          machineId: 'M-01',
          machineName: 'Injection Machine 1',
          moldNumber: 'MLD-55',
          cavityNumber: '4',
          employeeShift: 'Morning',
          crushedRisenConsumption: 15.5,
        },
      ],
    };
    let response: unknown;

    service.addRecord(payload).subscribe((result) => {
      response = result;
    });

    const request = httpMock.expectOne(apiUrl('crushed-risen-consumption-add'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ status: true, message: 'Crushed Risen Consumption saved successfully' });

    expect(response).toEqual({ status: true, message: 'Crushed Risen Consumption saved successfully' });
  });

  it('posts an update payload to the record-specific endpoint', () => {
    const payload = {
      remark: 'Updated1 consumption remarks',
      status: 'Closed',
      lines: [
        {
          machineId: 'M-04',
          machineName: 'Injection Machine 4',
          moldNumber: 'MLD-98',
          cavityNumber: '4',
          employeeShift: '03',
          crushedRisenConsumption: 29,
        },
      ],
    };
    let response: unknown;

    service.updateRecord(1, payload).subscribe((result) => {
      response = result;
    });

    const request = httpMock.expectOne(apiUrl('crushed-risen-consumption-update/1'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ status: true, message: 'Crushed Risen Consumption updated successfully' });

    expect(response).toEqual({ status: true, message: 'Crushed Risen Consumption updated successfully' });
  });

  it('fetches and maps an individual record with its consumption lines', () => {
    let detail: CrushedRisenConsumptionDetail | undefined;

    service.fetchRecordDetail(2).subscribe((result) => {
      detail = result;
    });

    const request = httpMock.expectOne(apiUrl('crushed-risen-consumption-detail/2'));
    expect(request.request.method).toBe('GET');
    request.flush({
      status: true,
      message: 'Crushed Risen Consumption retrieved successfully',
      data: {
        id: 2,
        doc_num_po: '100234',
        doc_entry_po: '542',
        item_code: 'RM-0012',
        item_name: 'Crushed Resin Material',
        crc_number: 'CRC-000001',
        series: '24',
        status: 'Open',
        user_signed: 'Admin',
        remark: 'Consumption test',
        create_date: '2026-10-26T00:00:00.000000Z',
        create_time: '11:18 AM',
        lines: [
          {
            machineId: 'M-01',
            moldNumber: 'MLD-55',
            machineName: 'Injection Machine 1',
            cavityNumber: '4',
            employeeShift: 'Morning',
            crushedRisenConsumption: 15.5,
          },
        ],
        sap_doc_entry: '14',
        sap_doc_num: '14',
      },
    });

    expect(detail).toEqual({
      id: 2,
      documentNumberFromProduction: '100234',
      itemCodeFromProduction: 'RM-0012',
      itemNameFromProduction: 'Crushed Resin Material',
      status: 'Open',
      productDocEntry: '542',
      crcNumber: 'CRC-000001',
      series: '24',
      signedUser: 'Admin',
      remark: 'Consumption test',
      createDate: '2026-10-26T00:00:00.000000Z',
      createTime: '11:18 AM',
      updateDate: '',
      updateTime: '',
      sapDocEntry: '14',
      sapDocNum: '14',
      lines: [
        {
          machineId: 'M-01',
          moldNumber: 'MLD-55',
          machineName: 'Injection Machine 1',
          cavityNumber: '4',
          employeeShift: 'Morning',
          crushedRisenConsumption: 15.5,
        },
      ],
    });
  });

  it('deletes a record by id and rejects an unsuccessful API response', () => {
    let completed = false;

    service.deleteRecord(2).subscribe(() => {
      completed = true;
    });

    const request = httpMock.expectOne(apiUrl('crushed-risen-consumption-delete/2'));
    expect(request.request.method).toBe('DELETE');
    request.flush({ status: true, message: 'Crushed Risen Consumption deleted successfully' });

    expect(completed).toBe(true);

    let errorMessage = '';
    service.deleteRecord(3).subscribe({
      error: (error: Error) => {
        errorMessage = error.message;
      },
    });
    httpMock
      .expectOne(apiUrl('crushed-risen-consumption-delete/3'))
      .flush({ status: false, message: 'Unable to delete record.' });

    expect(errorMessage).toBe('Unable to delete record.');
  });
});
