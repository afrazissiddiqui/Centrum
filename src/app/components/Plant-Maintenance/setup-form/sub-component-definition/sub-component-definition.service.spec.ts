import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiUrl } from '../../../../config/api.config';
import {
  buildMachinePayload,
  SubComponentDefinitionService,
} from './sub-component-definition.service';

describe('buildMachinePayload', () => {
  it('includes the selected location in the payload', () => {
    expect(
      buildMachinePayload({
        machineId: 'M-001',
        machineName: 'Main Machine',
        machineType: 'Blowing',
        location: 'AHCP_Peshawar',
        subComponents: ['Rotor', 'Gear'],
      }),
    ).toEqual({
      machine_id: 'M-001',
      machine_name: 'Main Machine',
      machine_type: 'Blowing',
      location: 'AHCP_Peshawar',
      sub_components: [{ name: 'Rotor' }, { name: 'Gear' }],
    });
  });
});

describe('SubComponentDefinitionService pagination', () => {
  let service: SubComponentDefinitionService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SubComponentDefinitionService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SubComponentDefinitionService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('loads each page from the API-provided URL and stores server pagination metadata', () => {
    service.fetchMachines().subscribe();

    httpTestingController.expectOne(apiUrl('machine-list')).flush({
      data: [
        {
          id: 1,
          machine_id: 'M-001',
          machine_name: 'First Machine',
          machine_type: 'Type A',
        },
      ],
      current_page: 1,
      last_page: 2,
      per_page: 15,
      from: 1,
      to: 15,
      total: 18,
      path: apiUrl('machine-list'),
      first_page_url: `${apiUrl('machine-list')}?page=1`,
      last_page_url: `${apiUrl('machine-list')}?page=2`,
      next_page_url: `${apiUrl('machine-list')}?page=2`,
      prev_page_url: null,
      links: [
        { url: null, label: '&laquo; Previous', active: false },
        { url: `${apiUrl('machine-list')}?page=1`, label: '1', active: true },
        { url: `${apiUrl('machine-list')}?page=2`, label: '2', active: false },
        { url: `${apiUrl('machine-list')}?page=2`, label: 'Next &raquo;', active: false },
      ],
    });

    expect(service.pagination()).toEqual({
      currentPage: 1,
      lastPage: 2,
      perPage: 15,
      total: 18,
      from: 1,
      to: 15,
      path: apiUrl('machine-list'),
      firstPageUrl: `${apiUrl('machine-list')}?page=1`,
      lastPageUrl: `${apiUrl('machine-list')}?page=2`,
      nextPageUrl: `${apiUrl('machine-list')}?page=2`,
      prevPageUrl: null,
      links: [
        { url: null, label: '&laquo; Previous', active: false },
        { url: `${apiUrl('machine-list')}?page=1`, label: '1', active: true },
        { url: `${apiUrl('machine-list')}?page=2`, label: '2', active: false },
        { url: `${apiUrl('machine-list')}?page=2`, label: 'Next &raquo;', active: false },
      ],
    });

    const nextPageUrl = service.pagination().nextPageUrl!;
    service.fetchMachines(nextPageUrl).subscribe();
    httpTestingController.expectOne(nextPageUrl).flush({
      data: [],
      current_page: 2,
      last_page: 2,
      per_page: 15,
      from: 16,
      to: 18,
      total: 18,
      path: apiUrl('machine-list'),
      next_page_url: null,
      prev_page_url: `${apiUrl('machine-list')}?page=1`,
      links: [],
    });

    expect(service.pagination().currentPage).toBe(2);
    expect(service.pagination().from).toBe(16);
    expect(service.pagination().to).toBe(18);
  });
});
