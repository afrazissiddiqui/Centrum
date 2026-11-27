import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CreateJobRequisitionComponent } from './create-job-requisition';
import { ApplicationFormService } from '../../../../services/application-form.service';
import { JobSpecificationService } from '../../../../services/job-specification.service';
import { GatePassItemMasterService } from '../../../gate-pass/gate-pass-item-master.service';
import { GatePassDepartmentService } from '../../../gate-pass/gate-pass-department.service';
import { AlertService } from '../../../../services/alert.service';

describe('CreateJobRequisitionComponent attachments', () => {
  it('uploads a selected file and puts the returned URL in the profile attachment payload', () => {
    const uploadResult = {
      type: 'Resume / CV',
      attachmentFor: 'Resume / CV',
      fileName: 'resume.pdf',
      fileUrl: 'https://example.test/resume.pdf',
      filePath: 'employee-attachments/15/resume.pdf',
    };
    const uploadEmployeeAttachment = vi.fn(
      (_file: File, _options: { employeeProfileId?: string; employeeCode?: string; type?: string }) =>
        of(uploadResult),
    );
    const serviceStub = {
      uploadEmployeeAttachment,
      getEmployeeAttachmentViewUrl: vi.fn(() => ''),
    };
    const component = new CreateJobRequisitionComponent(
      {} as Router,
      { snapshot: { paramMap: { get: () => null } } } as unknown as ActivatedRoute,
      { scrollToPosition: () => undefined } as unknown as ViewportScroller,
      serviceStub as unknown as ApplicationFormService,
      {} as JobSpecificationService,
      { listAllocatableAssets: () => [] } as unknown as GatePassItemMasterService,
      {} as GatePassDepartmentService,
      { warning: vi.fn(), error: vi.fn() } as unknown as AlertService,
      { markForCheck: vi.fn() } as unknown as ChangeDetectorRef,
    );
    const attachmentComponent = component as unknown as {
      attachmentRows: {
        set: (rows: Array<{
          type: string;
          fileName: string;
          fileUrl: string;
          files: File[];
          uploadedFiles: typeof uploadResult[];
        }>) => void;
      };
      onAttachmentFileChange: (rowIndex: number, event: Event) => void;
      buildAttachmentsPayload: () => Array<{ type: string; fileName: string; fileUrl: string }>;
      employeeCode: () => string;
    };
    const file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' });
    attachmentComponent.attachmentRows.set([{
      type: 'Resume / CV',
      fileName: '',
      fileUrl: '',
      files: [],
      uploadedFiles: [],
    }]);
    const input = { files: [file], value: 'selected' } as unknown as HTMLInputElement;

    attachmentComponent.onAttachmentFileChange(0, { target: input } as unknown as Event);

    expect(uploadEmployeeAttachment).toHaveBeenCalledWith(file, {
      employeeProfileId: undefined,
      employeeCode: undefined,
      type: 'Resume / CV',
    });
    expect(input.value).toBe('');
    expect(attachmentComponent.buildAttachmentsPayload()).toEqual([{
      type: 'Resume / CV',
      fileName: 'resume.pdf',
      fileUrl: 'https://example.test/resume.pdf',
    }]);
  });
});
