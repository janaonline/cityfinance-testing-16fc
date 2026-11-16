/**
 * XVI-FC Grant Portal — STATE "ULB-wise Allocation" (devolution formula) form.
 * URL: /fc/xvifc/{yearId}/ulb-wise-allocation
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (state-module/devolution-formula) and checked against staging.
 *
 * The form is shared server-side state. GET .../devolution-formula/
 * {stateId}/{yearId}/{installment} returns `permissions.canEdit`, true only
 * while the form is Not Started / In Progress / Returned. Editable-form tests
 * skip (pending) when it is locked, and the locked-view test skips while it
 * is editable.
 *
 * Every write is blocked. Selecting a VALID Excel would upload it and
 * auto-POST validate-excel, so only files the client rejects up front are
 * used. Save / Final Submit are only taken as far as their confirm dialog.
 */
import { blockWrites, loginAsState, visitStatePage } from '../../support/xvifcState';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

let blockedWrites: string[] = [];

function openAllocation() {
  cy.intercept('GET', '**/api/v2/xvi-fc/state/devolution-formula/*/*/1').as('dfForm');
  visitStatePage('ulb-wise-allocation');
  cy.wait('@dfForm').its('response.body.data').as('dfData');
}

function requireEditable(ctx: Mocha.Context, wanted: boolean) {
  cy.get('@dfData').then((data: any) => {
    if (Boolean(data.permissions?.canEdit) !== wanted) {
      cy.log(`ULB-wise Allocation is ${data.permissions?.canEdit ? 'editable' : 'locked'} — skipping`);
      ctx.skip();
    }
  });
}

function hasUploadedExcel(data: any): boolean {
  const q = data.questions?.find((x: any) => x.key === 'excelFile');
  return Boolean(q?.value?.url || q?.value?.name);
}

beforeEach(() => {
  loginAsState();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | STATE — ULB-wise Allocation page', () => {
  beforeEach(() => openAllocation());

  it('shows the heading, subtitle and form status', () => {
    cy.contains('h1', 'ULB-wise Allocation').should('be.visible');
    cy.contains('Please upload the ULB-wise allocation data for all ULBs in your state.').should('be.visible');
    cy.contains(/Current Form Status/i).should('be.visible');
  });

  it('opens on Installment 1 with Installment 2 matching its lock state', () => {
    cy.get('[data-cy="df-installment-1-btn"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('@dfData').then((data: any) => {
      const locked = data.installmentAccess?.installment2?.locked;
      cy.get('[data-cy="df-installment-2-btn"]').should(locked ? 'be.disabled' : 'be.enabled');
    });
  });
});

describe('XVI-FC Grant | STATE — ULB-wise Allocation editable form', () => {
  beforeEach(function () {
    openAllocation();
    requireEditable(this, true);
  });

  it('shows the ULB count, Excel upload and footer actions', () => {
    cy.get('[data-cy="ulbCount-test"]').should('exist');
    cy.get('[data-cy="excelFile-test"]').scrollIntoView().should('be.visible');
    cy.contains('Accepted formats: .xlsx, .xls').should('exist');
    cy.contains('Max file size: 20 MB').should('exist');
    cy.contains(/Allocated amount: ₹/).should('exist');
    cy.get('[data-cy="df-cancel-test"]').should('be.visible');
    cy.get('[data-cy="df-save-draft-test"]').should('be.visible');
    cy.get('[data-cy="df-final-submit-test"]').should('be.visible');
  });

  it('downloads the allocation template', () => {
    cy.intercept('GET', '**/devolution-formula/*/*/1/template').as('template');
    cy.contains('button', 'Download Template').click();
    cy.wait('@template').its('response.statusCode').should('eq', 200);
  });

  it('rejects a file that is not .xlsx/.xls before uploading it', () => {
    cy.get('[data-cy="excelFile-file-input-test"]')
      .selectFile('cypress/fixtures/valid-test-file.pdf', { force: true });
    cy.get('.swal2-html-container').should('contain.text', 'Allowed file extensions');
  });

  it('rejects an Excel file over 20 MB before uploading it', () => {
    cy.get('[data-cy="excelFile-file-input-test"]').selectFile({
      contents: Cypress.Buffer.alloc(21 * 1024 * 1024),
      fileName: 'ulb-wise-allocation.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }, { force: true });
    cy.get('.swal2-title').should('contain.text', 'File Limit Error');
    cy.get('.swal2-html-container').should('contain.text', 'Maximum 20 mb file can be allowed.');
  });

  it('asks for confirmation before saving a draft', () => {
    cy.get('[data-cy="df-save-draft-test"]').click();
    cy.contains('.confirm-dialog-title', 'Save as draft?').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.contains('Draft save cancelled.').should('be.visible');
  });

  it('blocks Final Submit until the Excel is uploaded', () => {
    cy.get('@dfData').then((data: any) => {
      if (hasUploadedExcel(data)) {
        cy.log('An Excel file is already uploaded — the empty-form check does not apply');
        return;
      }
      cy.get('[data-cy="df-final-submit-test"]').click();
      cy.contains('Please correct the errors in the form before submitting.').should('be.visible');
      cy.get('.confirm-dialog-title').should('not.exist');
    });
  });

  it('asks before discarding changes on Cancel', () => {
    cy.get('[data-cy="df-cancel-test"]').click();
    cy.contains('.confirm-dialog-title', 'Discard changes?').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.get('.confirm-dialog-title').should('not.exist');
  });

  it('warns about unsaved changes when leaving the page', () => {
    cy.get('[data-cy="checkboxConfirmation-test"]').find('input[type="checkbox"]').check({ force: true });
    cy.contains('a, button, li', 'SFC Status').click({ force: true });
    cy.contains('Leave without saving?').should('be.visible');
    cy.contains('button', 'Stay on page').click();
    cy.location('pathname').should('match', /\/ulb-wise-allocation$/);
  });
});

describe('XVI-FC Grant | STATE — ULB-wise Allocation submitted view', () => {
  beforeEach(function () {
    openAllocation();
    requireEditable(this, false);
  });

  it('hides the footer actions and the template download', () => {
    cy.get('[data-cy="df-save-draft-test"]').should('not.exist');
    cy.get('[data-cy="df-final-submit-test"]').should('not.exist');
    cy.contains('button', 'Download Template').should('not.exist');
  });
});
