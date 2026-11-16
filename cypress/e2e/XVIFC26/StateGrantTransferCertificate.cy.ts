/**
 * XVI-FC Grant Portal — STATE "Grant Transfer Certificate" (GTC) form.
 * URL: /fc/xvifc/{yearId}/gtc
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (state-module/gtc) and checked against staging.
 *
 * Staging's Installment 1 GTC was final-submitted (status 13, "Under Review
 * by MoHUA"), so for real it is read-only, and Installment 2 is always locked
 * on this release. Like the SFC spec, the "editable form" block loads the
 * REAL form data with the response's permissions flipped to editable, so the
 * edit-mode UI is still exercised. Every write is blocked and the afterEach
 * fails the test if one is attempted.
 */
import { blockWrites, loginAsState, visitStatePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const FORM_GET = '**/api/v2/xvi-fc/state/gtc/*/*/1';

let blockedWrites: string[] = [];

function openGtc(forceEditable = false) {
  cy.intercept('GET', FORM_GET, (req) => {
    if (!forceEditable) return;
    req.continue((res) => {
      const data = res.body?.data;
      if (!data) return;
      data.permissions = { ...data.permissions, canView: true, canEdit: true, canFinalSubmit: true };
      data.currentFormStatus = 2;
    });
  }).as('gtcForm');
  visitStatePage('gtc');
  cy.wait('@gtcForm').its('response.body.data').as('gtcData');
}

beforeEach(() => {
  loginAsState();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | STATE — Grant Transfer Certificate as loaded', () => {
  beforeEach(() => openGtc());

  it('shows the heading and subtitle', () => {
    cy.contains('h1', 'Grant Transfer Certificate').should('be.visible');
    cy.contains("the state must certify that each installment's grant funds have been transferred to ULBs")
      .should('be.visible');
    cy.contains(/Current Form Status/i).should('be.visible');
  });

  it('opens on Installment 1 with Installment 2 matching its lock state', () => {
    cy.get('[data-cy="gtc-installment-1-btn"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('@gtcData').then((data: any) => {
      const locked = data.installmentAccess?.installment2?.locked ?? true;
      cy.get('[data-cy="gtc-installment-2-btn"]').should(locked ? 'be.disabled' : 'be.enabled');
    });
  });

  it('shows the uploaded GTC without inputs once locked', function () {
    cy.get('@gtcData').then((data: any) => {
      if (data.permissions?.canEdit) this.skip();
      cy.get('[data-cy="gtc-submit-test"]').should('not.exist');
      cy.get('[data-cy="gtc-final-submit-test"]').should('not.exist');
      const file = data.questions?.find((q: any) => q.formFieldType === 'file' && q.value?.originalName);
      if (file) {
        cy.contains(file.label.trim().slice(0, 40)).should('be.visible');
        cy.contains(file.value.originalName).should('be.visible');
        cy.contains('View Document').should('be.visible');
      }
    });
  });
});

describe('XVI-FC Grant | STATE — Grant Transfer Certificate editable form', () => {
  beforeEach(() => openGtc(true));

  it('shows Cancel, Save and Final Submit', () => {
    cy.get('[data-cy="gtc-cancel-test"]').should('be.visible').and('be.enabled');
    cy.get('[data-cy="gtc-submit-test"]').should('be.visible').and('contain.text', 'Save');
    cy.get('[data-cy="gtc-final-submit-test"]').should('be.visible').and('contain.text', 'Final Submit');
  });

  it('asks for confirmation before saving a draft', () => {
    cy.get('[data-cy="gtc-submit-test"]').click();
    cy.contains('.confirm-dialog-title', 'Save as draft?').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.contains('Draft save cancelled.').should('be.visible');
  });

  it('Final Submit either confirms or reports the form errors', () => {
    cy.get('[data-cy="gtc-final-submit-test"]').click();
    cy.contains(/Submit form\?|Please correct the errors in the form before submitting\./).then(($el: JQuery<HTMLElement>) => {
      if ($el.text().includes('Submit form?')) {
        cy.contains('.confirm-dialog-btn', 'No, review again').click();
        cy.contains('Form submission cancelled.').should('be.visible');
      }
    });
  });

  it('asks before discarding changes on Cancel', () => {
    cy.get('[data-cy="gtc-cancel-test"]').click();
    cy.contains('.confirm-dialog-title', 'Discard changes?').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.get('.confirm-dialog-title').should('not.exist');
  });

  it('rejects a GTC that is not a PDF before uploading it', function () {
    cy.get('[data-cy="gtc-submit-test"]').should('be.visible'); // form rendered
    cy.get('body').then(($b) => {
      if (!$b.find('[data-cy$="-file-input-test"]').length) this.skip();
    });
    cy.get('[data-cy$="-file-input-test"]').first()
      .selectFile('cypress/fixtures/invalid-test-file.txt', { force: true });
    cy.get('.swal2-html-container').should('contain.text', 'Allowed file extensions');
  });

  it('rejects a GTC over the size limit before uploading it', function () {
    cy.get('[data-cy="gtc-submit-test"]').should('be.visible'); // form rendered
    cy.get('body').then(($b) => {
      if (!$b.find('[data-cy$="-file-input-test"]').length) this.skip();
    });
    cy.get('@gtcData').then((data: any) => {
      const q = data.questions?.find((x: any) => x.formFieldType === 'file');
      const maxMb = Number(q?.maxFileSize) || 20;
      cy.get('[data-cy$="-file-input-test"]').first().selectFile({
        contents: Cypress.Buffer.alloc((maxMb + 1) * 1024 * 1024),
        fileName: 'signed-gtc.pdf',
        mimeType: 'application/pdf',
      }, { force: true });
      cy.get('.swal2-title').should('contain.text', 'File Limit Error');
      cy.get('.swal2-html-container').should('contain.text', `Maximum ${maxMb} mb file can be allowed.`);
    });
  });
});
