import { Routes } from '@angular/router';
import { Delivery } from './delivery/delivery';
import { AddDelivery } from './delivery/add-delivery/add-delivery';
import { GoodIssue } from './good-issue/good-issue';
import { AddGoodIssue } from './good-issue/add-good-issue/add-good-issue';
import { GoodReceipt } from './good-receipt/good-receipt';
import { AddGoodReceipt } from './good-receipt/add-good-receipt/add-good-receipt';
import { InventoryTransfer } from './inventory-transfer/inventory-transfer';
import { AddInventoryTransfer } from './inventory-transfer/add-inventory-transfer/add-inventory-transfer';
import { InventoryTransferRequest } from './inventory-transfer-request/inventory-transfer-request';
import { AddInventoryTransferRequest } from './inventory-transfer-request/add-inventory-transfer-request/add-inventory-transfer-request';
import { MiscellaneousPageComponent } from './miscellaneous-page';
import { MiscellaneousShellComponent } from './miscellaneous-shell';
import { ReceiptFromProduction } from './receipt-from-production/receipt-from-production';
import { AddReceiptFromProduction } from './receipt-from-production/add-receipt-from-production/add-receipt-from-production';
import { IssueFromProductionListComponent } from '../setup/issue-from-production-list/issue-from-production-list';
import { PurchaseOrderListComponent } from '../setup/purchase-order-list/purchase-order-list';
import { CrushedRisenConsumptionComponent } from '../setup/crushed-risen-consumption/crushed-risen-consumption';
import { CrushedRisenConsumptionListComponent } from '../setup/crushed-risen-consumption-list/crushed-risen-consumption-list';

export const miscellaneousRoutes: Routes = [
  {
    path: 'miscellaneous',
    component: MiscellaneousShellComponent,
    children: [
      {
        path: '',
        component: MiscellaneousPageComponent,
        data: { title: 'SAP Form' },
      },
      {
        path: 'good-receipt-note',
        component: GoodReceipt,
        data: { title: 'Good Receipt' },
      },
      {
        path: 'good-receipt-note/create',
        component: AddGoodReceipt,
        data: { title: 'Add Good Receipt' },
      },
      {
        path: 'good-receipt-note/edit/:id',
        component: AddGoodReceipt,
        data: { title: 'Edit Good Receipt' },
      },
      {
        path: 'receipt-from-production',
        component: ReceiptFromProduction,
        data: { title: 'Receipt from production' },
      },
      {
        path: 'issue-from-production',
        component: IssueFromProductionListComponent,
        data: { title: 'Issue For Production' },
      },
      {
        path: 'purchase-request',
        component: PurchaseOrderListComponent,
        data: { title: 'Purchase Request' },
      },
      {
        path: 'crushed-risen-consumption',
        component: CrushedRisenConsumptionListComponent,
        data: { title: 'Crushed Risen Consumption List' },
      },
      {
        path: 'crushed-risen-consumption/create',
        component: CrushedRisenConsumptionComponent,
        data: { title: 'Crushed Risen Consumption' },
      },
      {
        path: 'crushed-risen-consumption/edit/:id',
        component: CrushedRisenConsumptionComponent,
        data: { title: 'Update Crushed Risen Consumption' },
      },
      {
        path: 'receipt-from-production/create',
        component: AddReceiptFromProduction,
        data: { title: 'Add Receipt from Production' },
      },
      {
        path: 'delivery',
        component: Delivery,
        data: { title: 'Delivery' },
      },
      {
        path: 'delivery/create',
        component: AddDelivery,
        data: { title: 'Add Delivery' },
      },
      {
        path: 'delivery/edit/:id',
        component: AddDelivery,
        data: { title: 'Edit Delivery' },
      },
      {
        path: 'inventory-transfer',
        component: InventoryTransfer,
        data: { title: 'Inventory transfer' },
      },
      {
        path: 'inventory-transfer/create',
        component: AddInventoryTransfer,
        data: { title: 'Add Inventory Transfer' },
      },
      {
        path: 'inventory-transfer/edit/:id',
        component: AddInventoryTransfer,
        data: { title: 'Edit Inventory Transfer' },
      },
      {
        path: 'inventory-transfer-request',
        component: InventoryTransferRequest,
        data: { title: 'Inventory Transfer Request' },
      },
      {
        path: 'inventory-transfer-request/create',
        component: AddInventoryTransferRequest,
        data: { title: 'Add Inventory Transfer Request' },
      },
      {
        path: 'inventory-transfer-request/edit/:id',
        component: AddInventoryTransferRequest,
        data: { title: 'Edit Inventory Transfer Request' },
      },
      {
        path: 'receipt-from-production/edit/:id',
        component: AddReceiptFromProduction,
        data: { title: 'Edit Receipt from Production' },
      },
      {
        path: 'good-issue',
        component: GoodIssue,
        data: { title: 'Good Issue' },
      },
      {
        path: 'good-issue/create',
        component: AddGoodIssue,
        data: { title: 'Add Good Issue' },
      },
      {
        path: 'good-issue/edit/:id',
        component: AddGoodIssue,
        data: { title: 'Edit Good Issue' },
      },
    ],
  },
];
