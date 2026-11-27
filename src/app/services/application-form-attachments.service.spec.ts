import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApplicationFormService } from './application-form.service';

describe('ApplicationFormService attachments', () => {
  let service: ApplicationFormService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApplicationFormService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApplicationFormService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('uploads multipart form data without setting Content-Type manually', () => {
    let uploaded: unknown;
    const file = new File(['resume'], 'cv.pdf', { type: 'application/pdf' });
    service.uploadEmployeeAttachment(file, {
      employeeProfileId: '5',
      employeeCode: '15',
      type: 'Resume / CV',
    }).subscribe((attachment) => uploaded = attachment);

    const request = httpMock.expectOne(
      'http://116.203.172.106:8084/centrum_test/public/api/employee-attachment-upload',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBe(true);
    expect(request.request.headers.get('Accept')).toBe('application/json');
    expect(request.request.headers.has('Content-Type')).toBe(false);
    const formData = request.request.body as FormData;
    const uploadedFile = formData.get('file') as File;
    expect(uploadedFile.name).toBe('cv.pdf');
    expect(uploadedFile.type).toBe('application/pdf');
    expect(formData.get('employee_profile_id')).toBe('5');
    expect(formData.get('employeeCode')).toBe('15');
    expect(formData.get('type')).toBe('Resume / CV');

    request.flush({
      status: true,
      message: 'Attachment uploaded successfully',
      data: {
        type: 'Resume / CV',
        fileName: 'cv.pdf',
        filePath: 'employee-attachments/15/cv.pdf',
        fileUrl: 'http://example.test/public/storage/employee-attachments/15/cv.pdf',
        viewUrl: 'http://example.test/public/api/employee-attachment-view?path=employee-attachments%2F15%2Fcv.pdf',
        downloadUrl: 'http://example.test/public/api/employee-attachment-view?path=employee-attachments%2F15%2Fcv.pdf&download=1',
      },
    });

    expect(uploaded).toEqual({
      type: 'Resume / CV',
      attachmentFor: 'Resume / CV',
      fileName: 'cv.pdf',
      filePath: 'employee-attachments/15/cv.pdf',
      fileUrl: 'http://example.test/public/storage/employee-attachments/15/cv.pdf',
      viewUrl: 'http://example.test/public/api/employee-attachment-view?path=employee-attachments%2F15%2Fcv.pdf',
      downloadUrl: 'http://example.test/public/api/employee-attachment-view?path=employee-attachments%2F15%2Fcv.pdf&download=1',
    });
  });

  it('deletes an attachment using its file URL', () => {
    let deleted = false;
    service.deleteEmployeeAttachment({
      fileUrl: 'http://example.test/public/storage/employee-attachments/15/cv.pdf',
    }).subscribe(() => deleted = true);

    const request = httpMock.expectOne(
      'http://116.203.172.106:8084/centrum_test/public/api/employee-attachment-delete',
    );
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({
      fileUrl: 'http://example.test/public/storage/employee-attachments/15/cv.pdf',
    });
    request.flush({ status: true, message: 'Attachment deleted successfully' });
    expect(deleted).toBe(true);
  });

  it('builds view and download URLs using the stored attachment path', () => {
    const attachment = {
      type: 'Resume / CV',
      fileName: 'cv.pdf',
      fileUrl: 'http://example.test/storage/cv.pdf',
      filePath: 'employee-attachments/15/cv file.pdf',
    };

    expect(service.getEmployeeAttachmentViewUrl(attachment)).toBe(
      'http://116.203.172.106:8084/centrum_test/public/api/employee-attachment-view?path=employee-attachments/15/cv%20file.pdf',
    );
    expect(service.getEmployeeAttachmentViewUrl(attachment, true)).toBe(
      'http://116.203.172.106:8084/centrum_test/public/api/employee-attachment-view?path=employee-attachments/15/cv%20file.pdf&download=1',
    );
  });
});
