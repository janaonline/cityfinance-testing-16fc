/**
 * XVI-FC Grant Portal — ULB "FY 2026-27 Conditions" page (entry conditions
 * checklist + Annual Budget Document upload).
 * URL: /fc/xvifc/{ulbId}/ulb-forms
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (ulb-module/ulb-forms) and checked against staging.
 *
 * Every row's icon, label and button is driven by GET /xvi-fc/form-status/
 * {ulbId}/{yearId}: the ULB forms by their form_status_id, the three
 * State-filed conditions by stateConditions.*.visible/value. The spec reads
 * that response and derives what each row should show, mirroring
 * ulb-forms.component.ts, so it holds whatever state the shared data is in.
 *
 * Budget-document uploads are only tried with files the page rejects before
 * any network call; every write is blocked anyway.
 */
import { blockWrites, loginAsUlb, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

/** form_status_id → button label, from CONDITION_STATUS_DISPLAY in ulb-forms.component.ts. */
const STATUS_BUTTON: Record<number, string> = {
  1: 'Start Upload', 2: 'Continue Uploading', 3: 'Submitted', 4: 'Reupload', 5: 'Approved by State',
  6: 'Reupload', 7: 'Approved by MoHUA', 8: 'Submitted', 12: 'Exempted', 16: 'Reupload',
};
const SUCCESS_IDS = new Set([3, 5, 7, 8, 12]);
const NO_PREVIEW_IDS = new Set([1, 12]);

type UlbRow = { title: string; route: string; key: string };
const ULB_ROWS: UlbRow[] = [
  { title: 'Audited Financial Statement FY 2024–25', route: 'upload-audited', key: 'auditedData' },
  { title: 'Provisional Financial Statement FY 2025–26', route: 'upload-provisional', key: 'unauditedData' },
  { title: 'XVI-FC Bank Account (PFMS)', route: 'xvi-fc-bank-account', key: 'xviFcBankAccount' },
  { title: 'Service Level Benchmarks', route: 'slb', key: 'serviceLevelBenchmarks' },
  { title: 'Detailed Utilisation Report', route: 'dur', key: 'detailedUtilisationReport' },
];
const STATE_ROWS = [
  { title: 'State Finance Commission Status', key: 'sfcStatus' },
  { title: 'Elected Body Status', key: 'electedBody' },
  { title: '14th FC Unspent Balance', key: 'fcUnspent' },
];
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

let blockedWrites: string[] = [];

function stateValue(entry: any): string | null {
  if (!entry?.visible) return null;
  if (entry.amount !== null && entry.amount !== undefined) return INR.format(entry.amount);
  return entry.value || null;
}

function conditionRow(title: string) {
  return cy.contains('.condition-row', title);
}

beforeEach(() => {
  loginAsUlb();
  blockedWrites = blockWrites();
  cy.intercept('GET', '**/api/v2/xvi-fc/form-status/*/*').as('formStatus');
  cy.intercept('GET', '**/api/v2/xvi-fc/budget-document?*').as('budgetDoc');
  visitWorkspacePage('ulb-forms');
  cy.wait('@formStatus').its('response.body.data').as('status');
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | ULB — FY Conditions page', () => {
  it('shows the year heading and the estimated grant band', () => {
    cy.contains('.page-title', /FY \d{4}-\d{2} Conditions/).should('be.visible');
    cy.get('.grant-band__eyebrow').should('contain.text', 'ESTIMATED GRANT');
    cy.get('@status').then((s: any) => {
      const dev = s.stateConditions?.devolution;
      if (dev?.visible && dev.amount !== null) {
        cy.get('.grant-band__amount').should('contain.text', INR.format(dev.amount));
      } else {
        cy.get('.grant-band__amount')
          .should('contain.text', 'Allocation will be displayed once the State submits the ULB-wise allocation');
      }
    });
  });

  it('lists all eight first-installment conditions', () => {
    cy.contains('.conditions-deadline-badge', 'FIRST INSTALLMENT').should('be.visible');
    cy.get('.conditions-list .condition-row').should('have.length', 8);
    [...STATE_ROWS, ...ULB_ROWS].forEach((r) => conditionRow(r.title).should('exist'));
  });

  it('shows progress that matches the completed conditions', () => {
    cy.get('@status').then((s: any) => {
      const stateDone = STATE_ROWS.filter((r) => stateValue(s.stateConditions?.[r.key])).length;
      const ulbDone = ULB_ROWS.filter((r) => SUCCESS_IDS.has(s[r.key]?.form_status_id)).length;
      cy.contains(`${stateDone + ulbDone} of 8 complete`).should('be.visible');
    });
  });

  it('shows what the State filed, or that it is still awaited', () => {
    cy.get('@status').then((s: any) => {
      STATE_ROWS.forEach((r) => {
        const value = stateValue(s.stateConditions?.[r.key]);
        conditionRow(r.title).within(() => {
          if (value) {
            cy.contains('Filed by the State').should('exist');
            cy.get('.state-value-badge').should('contain.text', value);
          } else {
            cy.contains('Status will be displayed once the State uploads this information').should('exist');
            cy.get('.awaiting-state-badge').should('contain.text', 'AWAITING STATE UPLOAD');
          }
        });
      });
    });
  });

  it("shows each ULB form's action for its current status", () => {
    cy.get('@status').then((s: any) => {
      ULB_ROWS.forEach((r) => {
        const id = s[r.key]?.form_status_id;
        const label = STATUS_BUTTON[id];
        if (!label) return; // status this page has no mapping for
        conditionRow(r.title).within(() => {
          cy.get('.condition-action-btn').should('contain.text', label);
          cy.get('.preview-icon-btn').should(NO_PREVIEW_IDS.has(id) ? 'not.exist' : 'exist');
        });
      });
    });
  });

  ULB_ROWS.forEach((r) => {
    it(`opens ${r.title.replace(/ FY.*/, '')} from its row`, () => {
      conditionRow(r.title).find('.condition-action-btn').click();
      cy.location('pathname').should('match', new RegExp(`/${r.route}$`));
    });
  });
});

describe('XVI-FC Grant | ULB — Annual Budget Document', () => {
  const BUDGET_INPUT = 'input[type="file"][accept="application/pdf"]';

  beforeEach(() => {
    cy.wait('@budgetDoc');
    cy.contains('.condition-row', 'Annual Budget Document').as('budgetRow');
  });

  it('shows the upload row with its current file, if any', () => {
    cy.get('@budgetDoc').its('response.body').then((body: any) => {
      const file = (body.data ?? body)?.file;
      cy.get('@budgetRow').within(() => {
        if (file?.name) {
          cy.contains(`Uploaded: ${file.name}`).should('be.visible');
          cy.contains('button', 'Re-upload').should('be.enabled');
        } else {
          cy.contains('annual budget document for greater transparency').should('be.visible');
          cy.contains('button', /^\s*Upload\s*$/).should('be.enabled');
        }
      });
    });
  });

  it('rejects a file that is not a PDF', () => {
    cy.get('@budgetRow').find(BUDGET_INPUT).selectFile('cypress/fixtures/invalid-test-file.txt', { force: true });
    cy.get('@budgetRow').should('contain.text', 'Only PDF files are allowed.');
  });

  it('rejects a PDF over 20 MB', () => {
    cy.get('@budgetRow').find(BUDGET_INPUT).selectFile({
      contents: Cypress.Buffer.alloc(21 * 1024 * 1024),
      fileName: 'budget.pdf',
      mimeType: 'application/pdf',
    }, { force: true });
    cy.get('@budgetRow').should('contain.text', 'File size must not exceed 20 MB.');
  });

  it('rejects a ".pdf" whose contents are not a PDF', () => {
    cy.get('@budgetRow').find(BUDGET_INPUT).selectFile({
      contents: Cypress.Buffer.from('this is not really a pdf'),
      fileName: 'budget.pdf',
      mimeType: 'application/pdf',
    }, { force: true });
    cy.get('@budgetRow').should('contain.text', 'Please upload a valid PDF file.');
  });
});
