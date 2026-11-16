/**
 * XVI-FC Grant Portal — STATE "SFC Status" (State Finance Commission
 * Verification) form.
 * URL: /fc/xvifc/{yearId}/sfc-status
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (state-module/sfc-status) and checked against staging.
 *
 * Staging's form was final-submitted (status 13, "Under Review by MoHUA"),
 * so for real it is read-only. Two blocks:
 *   - "as loaded" checks whatever view the server actually returns;
 *   - "editable form" loads the REAL form data but flips the response's
 *     permissions to editable, so the edit-mode UI (footer, dialogs,
 *     unsaved-changes guard) is still exercised. That is safe because every
 *     write is blocked and the afterEach fails the test if one is attempted.
 */
import { blockWrites, loginAsState, visitStatePage } from '../../support/xvifcState';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const FORM_GET = '**/api/v2/xvi-fc/state/sfc-status/*/*';
const STATUS_LABELS: Record<number, string> = {
  0: 'Not Started', 1: 'Not Started', 2: 'In Progress', 3: 'In Progress', 4: 'In Progress',
  5: 'Under Review by MoHUA', 13: 'Under Review by MoHUA', 15: 'Under Review by MoHUA',
  6: 'Returned by MoHUA', 7: 'Acknowledged by MoHUA', 14: 'Returned for correction', 16: 'Returned for correction',
};

let blockedWrites: string[] = [];

function openSfc(forceEditable = false) {
  cy.intercept('GET', FORM_GET, (req) => {
    if (!forceEditable) return;
    req.continue((res) => {
      const data = res.body?.data;
      if (!data) return;
      data.permissions = { ...data.permissions, canView: true, canEdit: true, canFinalSubmit: true };
      data.currentFormStatus = 2;
      data.exemptionStatus = null;
    });
  }).as('sfcForm');
  visitStatePage('sfc-status');
  cy.wait('@sfcForm').its('response.body.data').as('sfcData');
}

beforeEach(() => {
  loginAsState();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | STATE — SFC Status as loaded', () => {
  beforeEach(() => openSfc());

  it('shows the heading and subtitle', () => {
    cy.contains('h1', 'State Finance Commission Verification').should('be.visible');
    cy.contains('the constitution and functioning of the State Finance Commission (SFC) must be verified')
      .should('be.visible');
  });

  it('shows the form status from the API', () => {
    cy.get('@sfcData').then((data: any) => {
      if (data.exemptionStatus === 'APPROVED') {
        cy.contains('Exempted — Discretionary Approval').should('be.visible');
        return;
      }
      cy.contains(/Current Form Status/i).should('be.visible');
      cy.get('[class*="form-progress__pill"]').should('contain.text', STATUS_LABELS[data.currentFormStatus]);
      ['Not Started', 'In Progress', 'Submitted to MoHUA'].forEach((step) =>
        cy.contains('.form-progress__step-label', step).should('exist'));
    });
  });

  it('shows the answers as text, without inputs, once locked', function () {
    cy.get('@sfcData').then((data: any) => {
      if (data.permissions?.canEdit) this.skip();
      cy.get('[data-cy="sfc-status-submit-test"]').should('not.exist');
      cy.get('[data-cy="sfc-status-final-submit-test"]').should('not.exist');
      cy.get('form.content-body input:not([type="hidden"])').should('not.exist');
      const answered = data.questions?.filter((q: any) => q.label && q.value != null && q.value !== '') ?? [];
      // Some answered questions are hidden by their visibleWhen rules, so only
      // require that the shown ones come from the saved answers.
      const labels = answered.map((q: any) => q.label.trim().slice(0, 40));
      cy.get('form.content-body').invoke('text').should((text) => {
        expect(labels.some((l: string) => text.includes(l)), 'an answered question is displayed').to.be.true;
      });
    });
  });

  it('lets the uploaded documents be viewed', function () {
    cy.get('@sfcData').then((data: any) => {
      const files = data.questions?.filter((q: any) => q.formFieldType === 'file' && q.value?.originalName) ?? [];
      if (data.permissions?.canEdit || !files.length) this.skip();
      cy.contains(files[0].value.originalName).should('be.visible');
      cy.contains('View Document').should('be.visible');
    });
  });
});

describe('XVI-FC Grant | STATE — SFC Status editable form', () => {
  beforeEach(() => openSfc(true));

  it('shows Cancel, Save and Final Submit', () => {
    cy.get('[data-cy="sfc-status-cancel-test"]').should('be.visible').and('be.enabled');
    cy.get('[data-cy="sfc-status-submit-test"]').should('be.visible').and('contain.text', 'Save');
    cy.get('[data-cy="sfc-status-final-submit-test"]').should('be.visible').and('contain.text', 'Final Submit');
  });

  it('asks for confirmation before saving a draft', () => {
    cy.get('[data-cy="sfc-status-submit-test"]').click();
    cy.contains('.confirm-dialog-title', 'Save as draft?').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.contains('Draft save cancelled.').should('be.visible');
  });

  it('Final Submit either confirms or reports the form errors', () => {
    cy.get('[data-cy="sfc-status-final-submit-test"]').click();
    cy.contains(/Submit form\?|Please correct the errors in the form before submitting\./).then(($el: JQuery<HTMLElement>) => {
      if ($el.text().includes('Submit form?')) {
        cy.contains('Please confirm that you want to submit this form.').should('be.visible');
        cy.contains('.confirm-dialog-btn', 'No, review again').click();
        cy.contains('Form submission cancelled.').should('be.visible');
      }
    });
  });

  it('asks before discarding changes on Cancel', () => {
    cy.get('[data-cy="sfc-status-cancel-test"]').click();
    cy.contains('.confirm-dialog-title', 'Discard changes?').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.get('.confirm-dialog-title').should('not.exist');
  });

  it('rejects a wrong-type document before uploading it', function () {
    cy.get('[data-cy="sfc-status-submit-test"]').should('be.visible'); // form rendered
    cy.get('body').then(($b) => {
      if (!$b.find('[data-cy$="-file-input-test"]').length) this.skip();
    });
    cy.get('[data-cy$="-file-input-test"]').first()
      .selectFile('cypress/fixtures/invalid-test-file.txt', { force: true });
    cy.get('.swal2-html-container').should('contain.text', 'Allowed file extensions');
  });

  it('warns about unsaved changes when leaving the page', function () {
    cy.get('[data-cy="sfc-status-submit-test"]').should('be.visible'); // form rendered
    cy.get('body').then(($b) => {
      if (!$b.find('[data-cy="raiseAnIssue-test"]').length) this.skip();
    });
    cy.get('[data-cy="raiseAnIssue-test"]').then(($el) => ($el.is('textarea') ? $el : $el.find('textarea')))
      .type(' (cypress)', { force: true });
    cy.contains('span.menu-label', 'Requirements').click();
    cy.contains('Leave without saving?').should('be.visible');
    cy.contains('button', 'Stay on page').click();
    cy.location('pathname').should('match', /\/sfc-status$/);
  });
});
