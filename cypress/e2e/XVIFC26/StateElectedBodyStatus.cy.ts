/**
 * XVI-FC Grant Portal — STATE "Elected Body Status" form.
 * URL: /fc/xvifc/{yearId}/elected-body-status
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (state-module/elected-body-status) and checked against staging.
 *
 * The form is shared server-side state. GET .../elected-urban-local-bodies/
 * {stateId}/{yearId} returns `permissions.canEdit`, which the backend sets
 * only while the status is Not Started / In Progress / Returned. The
 * editable-form tests skip (pending) when the form is locked, and the
 * submitted-view tests skip while it is editable.
 *
 * Every write is blocked. Selecting a VALID Excel would upload it and
 * auto-POST validate-excel (a real write), so only files the client rejects
 * before any network call are used here.
 */
import { blockWrites, loginAsState, visitStatePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const FORM_GET = '**/api/v2/xvi-fc/state/elected-urban-local-bodies/*/*';

let blockedWrites: string[] = [];

function openElectedBodyStatus() {
  cy.intercept('GET', FORM_GET).as('ebsForm');
  visitStatePage('elected-body-status');
  cy.wait('@ebsForm').its('response.body.data').as('ebsData');
}

function requireEditable(ctx: Mocha.Context, wanted: boolean) {
  cy.get('@ebsData').then((data: any) => {
    if (Boolean(data.permissions?.canEdit) !== wanted) {
      cy.log(`Elected Body Status is ${data.permissions?.canEdit ? 'editable' : 'locked'} — skipping`);
      ctx.skip();
    }
  });
}

beforeEach(() => {
  loginAsState();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | STATE — Elected Body Status page', () => {
  beforeEach(() => openElectedBodyStatus());

  it('shows the heading, subtitle and form status', () => {
    cy.contains('h1', 'Elected Urban Local Bodies - Status Confirmation').should('be.visible');
    cy.contains('Urban Local Bodies must have duly constituted elected bodies in place').should('be.visible');
    cy.contains(/Current Form Status/i).should('be.visible');
    cy.contains('Submitted to MoHUA').should('exist');
  });

  it('is highlighted under State Level Conditions in the sidebar', () => {
    cy.contains('a, button, li', 'Elected Body Status').should('be.visible');
    cy.location('pathname').should('match', /\/elected-body-status$/);
  });
});

describe('XVI-FC Grant | STATE — Elected Body Status editable form', () => {
  beforeEach(function () {
    openElectedBodyStatus();
    requireEditable(this, true);
  });

  it('shows the ULB count, Excel upload and footer actions', () => {
    cy.get('[data-cy="ulbCount-test"]').should('exist');
    cy.contains('Active ULBs Registered on City Finance').should('be.visible');
    cy.get('[data-cy="electedBodyExcelFile-test"]').scrollIntoView().should('be.visible');
    cy.contains('Accepted formats: .xlsx, .xls').should('exist');
    cy.contains('Max file size: 20 MB').should('exist');
    cy.get('[data-cy="checkboxConfirmation-test"]').should('exist');
    cy.get('[data-cy="eulb-status-cancel-test"]').should('be.visible');
    cy.get('[data-cy="eulb-status-save-draft-test"]').should('be.visible');
    cy.get('[data-cy="eulb-status-final-submit-test"]').should('be.visible');
  });

  it('downloads the Excel template', () => {
    cy.intercept('GET', '**/elected-urban-local-bodies/*/*/template').as('template');
    cy.contains('button', 'Download the template').click();
    cy.wait('@template').its('response.statusCode').should('eq', 200);
  });

  it('rejects a file that is not .xlsx/.xls before uploading it', () => {
    cy.get('[data-cy="electedBodyExcelFile-file-input-test"]')
      .selectFile('cypress/fixtures/valid-test-file.pdf', { force: true });
    cy.get('.swal2-html-container').should('contain.text', 'Allowed file extensions');
  });

  it('rejects an Excel file over 20 MB before uploading it', () => {
    cy.get('[data-cy="electedBodyExcelFile-file-input-test"]').selectFile({
      contents: Cypress.Buffer.alloc(21 * 1024 * 1024),
      fileName: 'elected-bodies.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }, { force: true });
    cy.get('.swal2-title').should('contain.text', 'File Limit Error');
    cy.get('.swal2-html-container').should('contain.text', 'Maximum 20 mb file can be allowed.');
  });

  it('blocks Final Submit while required fields are empty', () => {
    cy.get('@ebsData').then((data: any) => {
      const excel = data.questions?.find((q: any) => q.key === 'electedBodyExcelFile');
      if (excel?.value?.url || excel?.value?.name) {
        cy.log('An Excel file is already uploaded — the empty-form check does not apply');
        return;
      }
      cy.get('[data-cy="eulb-status-final-submit-test"]').click();
      cy.contains('Please correct the errors in the form before submitting.').should('be.visible');
      cy.get('.confirm-dialog-title').should('not.exist');
    });
  });

  it('asks before discarding changes on Cancel', () => {
    cy.get('[data-cy="eulb-status-cancel-test"]').click();
    cy.contains('.confirm-dialog-title', 'Discard changes?').should('be.visible');
    cy.contains('Any unsaved changes will be lost.').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.get('.confirm-dialog-title').should('not.exist');
  });

  it('warns about unsaved changes when leaving the page', () => {
    cy.get('[data-cy="checkboxConfirmation-test"]').find('input[type="checkbox"]').check({ force: true });
    cy.contains('a, button, li', 'SFC Status').click({ force: true });
    cy.contains('Leave without saving?').should('be.visible');
    cy.contains('button', 'Stay on page').click();
    cy.location('pathname').should('match', /\/elected-body-status$/);
  });
});

describe('XVI-FC Grant | STATE — Elected Body Status submitted view', () => {
  beforeEach(function () {
    openElectedBodyStatus();
    requireEditable(this, false);
  });

  it('shows no Save / Final Submit and no template download', () => {
    cy.get('[data-cy="eulb-status-save-draft-test"]').should('not.exist');
    cy.get('[data-cy="eulb-status-final-submit-test"]').should('not.exist');
    cy.contains('button', 'Download the template').should('not.exist');
  });

  it('summarises how many ULBs have constituted elected bodies', () => {
    cy.get('@ebsData').then((data: any) => {
      if (data.currentFormStatus < 5) return;
      cy.get('[data-testid="status-summary-section"]').should('be.visible')
        .and('contain.text', 'Elected Body Status submitted');
      cy.get('[data-testid="status-summary-card"]').should('have.length', 3);
      cy.contains('Eligible - elected body constituted').should('be.visible');
      cy.contains('Ineligible - no elected body').should('be.visible');
    });
  });
});
