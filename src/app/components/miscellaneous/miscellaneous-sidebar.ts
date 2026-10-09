import { SidebarItem, SidebarSection } from '../sidebar/sidebar';
import { AccessRequirement } from '../../utils/access-requirement.util';

export const MISCELLANEOUS_SIDEBAR_ITEMS: SidebarItem[] = [];

export const MISCELLANEOUS_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: 'miscellaneous-actions',
    title: 'SAP Form',
    items: [
      {
        id: 'miscellaneous-good-receipt-note',
        label: 'Good Receipt',
        route: '/miscellaneous/good-receipt-note',
        access: { moduleSlug: 'good_receipt_note_form', action: 'list' } as AccessRequirement,
      },
      {
        id: 'miscellaneous-good-issue',
        label: 'Good Issue',
        route: '/miscellaneous/good-issue',
        access: { moduleSlug: 'good_issue_form', action: 'list' } as AccessRequirement,
      },
      {
        id: 'miscellaneous-delivery',
        label: 'Delivery',
        route: '/miscellaneous/delivery',
        access: { moduleSlug: 'delivery_form', action: 'list' } as AccessRequirement,
      },
      {
        id: 'miscellaneous-inventory-transfer',
        label: 'Inventory Transfer',
        route: '/miscellaneous/inventory-transfer',
        access: { moduleSlug: 'inventory_transfer_form', action: 'list' } as AccessRequirement,
      },
      {
        id: 'miscellaneous-inventory-transfer-request',
        label: 'Inventory Transfer Request',
        route: '/miscellaneous/inventory-transfer-request',
        access: { moduleSlug: 'inventory_transfer_request_form', action: 'list' } as AccessRequirement,
      },
      {
        id: 'miscellaneous-receipt-from-production',
        label: 'Receipt From Production',
        route: '/miscellaneous/receipt-from-production',
        access: { moduleSlug: 'receipt_from_production_form', action: 'list' } as AccessRequirement,
      },
      {
        id: 'miscellaneous-issue-from-production',
        label: 'Issue From Production',
        route: '/miscellaneous/issue-from-production',
        access: { moduleSlug: 'issue_from_production_form', action: 'list' } as AccessRequirement,
      },
      {
        id: 'miscellaneous-purchase-request',
        label: 'Purchase Request',
        route: '/miscellaneous/purchase-request',
        access: { moduleSlug: 'purchase_request_form', action: 'list' } as AccessRequirement,
      },
      {
        id: 'miscellaneous-crushed-risen-consumption',
        label: 'Crushed Risen Consumption',
        route: '/miscellaneous/crushed-risen-consumption',
        access: { moduleSlug: 'purchase_request_form', action: 'list' } as AccessRequirement,
      },
    ],
  },
];

export function miscellaneousActiveItemFromUrl(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  if (/\/miscellaneous\/?$/.test(path)) {
    return '';
  }
  if (url.includes('/miscellaneous/receipt-from-production')) {
    return 'miscellaneous-receipt-from-production';
  }
  if (url.includes('/miscellaneous/issue-from-production') || url.includes('/setup/issue-from-production')) {
    return 'miscellaneous-issue-from-production';
  }
  if (url.includes('/miscellaneous/purchase-request')) {
    return 'miscellaneous-purchase-request';
  }
  if (url.includes('/miscellaneous/crushed-risen-consumption')) {
    return 'miscellaneous-crushed-risen-consumption';
  }
  if (url.includes('/miscellaneous/delivery')) {
    return 'miscellaneous-delivery';
  }
  if (url.includes('/miscellaneous/inventory-transfer-request')) {
    return 'miscellaneous-inventory-transfer-request';
  }
  if (url.includes('/miscellaneous/inventory-transfer')) {
    return 'miscellaneous-inventory-transfer';
  }
  if (url.includes('/miscellaneous/good-issue')) {
    return 'miscellaneous-good-issue';
  }
  if (url.includes('/miscellaneous/good-receipt-note')) {
    return 'miscellaneous-good-receipt-note';
  }
  return '';
}
