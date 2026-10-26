import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiUrl } from '../../../../config/api.config';
import { PlantMaintenanceMasterFormService } from './plant-maintenance-master-form.service';

describe('PlantMaintenanceMasterFormService pagination', () => {
  let service: PlantMaintenanceMasterFormService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PlantMaintenanceMasterFormService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(PlantMaintenanceMasterFormService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('requests the requested page and stores server pagination metadata', () => {
    service.fetchPlantMaintenanceMasterFormPage(2, 15).subscribe();

    const request = httpTestingController.expectOne(
      (req) =>
        req.url === apiUrl('plant-maintenance-main-form-list') &&
        req.params.get('page') === '2' &&
        req.params.get('per_page') === '15',
    );
    request.flush({
      data: [{ id: 16, machine_id: 'M-016', machine_name: 'Machine 16' }],
      current_page: 2,
      last_page: 5,
      per_page: 15,
      from: 16,
      to: 30,
      total: 66,
    });

    expect(service.records().map((record) => record.machineId)).toEqual(['M-016']);
    expect(service.pagination()).toEqual({
      currentPage: 2,
      lastPage: 5,
      perPage: 15,
      from: 16,
      to: 30,
      total: 66,
    });
  });

  it('loads all pages for existing consumers of the full-list method', () => {
    let machineIds: string[] = [];
    service.fetchPlantMaintenanceMasterForms().subscribe((records) => {
      machineIds = records.map((record) => record.machineId);
    });

    httpTestingController.expectOne(apiUrl('plant-maintenance-main-form-list')).flush({
      data: [{ id: 1, machine_id: 'M-001', machine_name: 'Machine 1' }],
      current_page: 1,
      last_page: 2,
      per_page: 1,
      from: 1,
      to: 1,
      total: 2,
    });
    httpTestingController
      .expectOne(
        (req) =>
          req.url === apiUrl('plant-maintenance-main-form-list') &&
          req.params.get('page') === '2' &&
          req.params.get('per_page') === '1',
      )
      .flush({
        data: [{ id: 2, machine_id: 'M-002', machine_name: 'Machine 2' }],
        current_page: 2,
        last_page: 2,
        per_page: 1,
        from: 2,
        to: 2,
        total: 2,
      });

    expect(machineIds).toEqual(['M-001', 'M-002']);
  });
});
