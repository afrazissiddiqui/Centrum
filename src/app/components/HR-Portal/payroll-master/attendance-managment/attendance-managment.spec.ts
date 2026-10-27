import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { attendanceSearchUserId } from './attendance-managment';

describe('attendanceSearchUserId', () => {
  it('uses exact numeric employee searches to scope date-range requests', () => {
    expect(attendanceSearchUserId('179', 'dateRange')).toBe('179');
    expect(attendanceSearchUserId(' Emp-00000179 ', 'dateRange')).toBe('Emp-00000179');
  });

  it('keeps partial text and non-date-range searches client-side', () => {
    expect(attendanceSearchUserId('Inam Ullah', 'dateRange')).toBe('');
    expect(attendanceSearchUserId('17', 'date')).toBe('');
  });
});