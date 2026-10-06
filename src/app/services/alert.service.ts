import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root'
})
export class AlertService {

  success(title: string, message: string): void {
    void Swal.fire({
      title: title,
      text: message,
      icon: 'success',
      confirmButtonColor: '#0052cc',
      timer: 3000,
      timerProgressBar: true
    });
  }

  successAndWait(title: string, message: string): Promise<any> {
    return Swal.fire({
      title: title,
      text: message,
      icon: 'success',
      confirmButtonColor: '#0052cc'
    });
  }

  error(title: string, message: string): void {
    void Swal.fire({
      title: title,
      text: message,
      icon: 'error',
      confirmButtonColor: '#0052cc'
    });
  }

  warning(title: string, message: string): void {
    void Swal.fire({
      title: title,
      text: message,
      icon: 'warning',
      confirmButtonColor: '#0052cc'
    });
  }

  validation(message: string): void {
    void Swal.fire({
      title: 'Missing Fields',
      text: message,
      icon: 'warning',
      confirmButtonColor: '#0052cc',
      toast: true,
      position: 'top-end',
      timer: 4000,
      showConfirmButton: false,
      timerProgressBar: true
    });
  }

  toast(message: string, icon: 'success' | 'info' | 'warning' | 'error' = 'success'): void {
    void Swal.fire({
      title: message,
      icon: icon,
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      confirmButtonColor: '#0052cc',
    });
  }

  confirm(title: string, message: string): Promise<any> {
    return Swal.fire({
      title: title,
      text: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0052cc',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, proceed!'
    });
  }

  chooseDuplicateAction(title: string, message: string): Promise<'update' | 'add' | null> {
    return Swal.fire({
      title,
      text: message,
      icon: 'warning',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonColor: '#0052cc',
      denyButtonColor: '#d33',
      cancelButtonColor: '#777',
      confirmButtonText: 'Add another row',
      denyButtonText: 'Update existing',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        return 'add';
      }
      if (result.isDenied) {
        return 'update';
      }
      return null;
    });
  }
}