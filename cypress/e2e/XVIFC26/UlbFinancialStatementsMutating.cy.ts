/**
 * XVI-FC Grant Portal — ULB Audited / Provisional Financial Statements:
 * REAL uploads of generated statements, end to end through verification.
 *
 * ⚠ MUTATING — this performs real writes against the shared staging ULB:
 *   - every required document slot that can take a file gets the matching
 *     statement from cypress/fixtures/financial-statements/{audited|provisional}
 *     (made by generate.js there, following the in-app Document Upload Guide:
 *     right document type per slot, ULB name and financial year shown, readable
 *     text, every page marked as a dummy test document). Each upload is stored
 *     in S3, saved as a new upload version and sent to automated (AI/OCR)
 *     verification;
 *   - the section moves to IN_PROGRESS ("Continue Uploading" on Conditions),
 *     including from Returned.
 * Like the other *Mutating specs it is excluded from default/CI runs and only
 * runs when targeted with --spec.
 *
 * Verification is the backend's decision. The test waits for each verdict and
 * checks the page reports it correctly (badge, failed checks, follow-up
 * actions) and that it persists after a reload. Every run starts fresh:
 * required documents that already PASSED are removed (Delete → "Remove and
 * re-upload") and uploaded again; FAILED / stale ones are re-uploaded.
 * Note: a document that FAILS after its first version only offers "Request
 * Manual Review" (no Re-upload) until someone reviews it.
 *
 * Never done here (blocked, fails the test if attempted): Submit to State
 * DMA, Request Manual Review, Retry Verification. When every required
 * document passes, the Submit dialog is opened and cancelled.
 */
import { loginAsUlb, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const FIXTURES = 'cypress/fixtures/financial-statements';
const EDITABLE_STATUS_IDS = new Set([1, 2, 4, 6, 16]);
// Verification runs asynchronously; the page polls every 5 s for up to 20 min.
const VERIFICATION_TIMEOUT = 15 * 60 * 1000;
const UPLOAD_BUTTONS = '.doc-action-btn--upload, .doc-action-btn--reupload';
const VERDICT = '.passed-badge, .file-chip--passed, .returned-badge, .failed-badge, .stale-badge';
const ROWS = '.doc-row:not(.doc-row--skeleton)';

const PAGES = [
  { name: 'Audited', route: 'upload-audited', type: 'audited', section: 'auditedData',
    conditionTitle: 'Audited Financial Statement FY 2024–25' },
  { name: 'Provisional', route: 'upload-provisional', type: 'provisional', section: 'unauditedData',
    conditionTitle: 'Provisional Financial Statement FY 2025–26' },
];

let forbidden: string[] = [];

/** Lets uploads through but refuses the one-way actions this spec must never take. */
function forbidOneWayActions() {
  forbidden = [];
  const refuse = (label: string) => (req: any) => {
    forbidden.push(`${label}: ${req.method} ${req.url}`);
    req.reply({ statusCode: 418, body: { success: false, message: 'Blocked by Cypress' } });
  };
  cy.intercept('POST', '**/api/v2/xvi-fc/annual-account/*/submit', refuse('submit'));
  cy.intercept('POST', '**/api/v2/xvi-fc/annual-account/*/documents/*/manual-review*', refuse('manual review'));
  cy.intercept('POST', '**/api/v2/xvi-fc/annual-account/*/documents/*/retry', refuse('retry'));
}

function isEditable(acct: any): boolean {
  const id = acct?.data?.form_status_id ?? 1;
  const exemption = acct?.exemptionStatus;
  return EDITABLE_STATUS_IDS.has(id) && exemption !== 'PENDING' && exemption !== 'APPROVED';
}

/** The document row whose title is exactly `label` ("Balance Sheet" ≠ "Balance Sheet Schedules"). */
function rowFor(label: string) {
  return cy.get(ROWS).filter((_, r) => {
    const title = r.querySelector('.doc-title')?.textContent ?? '';
    return title.replace(/\*|optional/gi, '').trim() === label;
  }).should('have.length', 1);
}

/** Checks a row shows its verification verdict the way the page should. */
function expectVerdictShown(title: string) {
  rowFor(title).then(($row) => {
    if ($row.find('.passed-badge, .file-chip--passed').length) {
      cy.log(`${title}: PASSED`);
      cy.wrap($row).find('.validation-panel').should('not.exist');
    } else if ($row.find('.failed-badge').length) {
      cy.log(`${title}: FAILED`);
      cy.wrap($row).find('.failed-badge').should('contain.text', 'FAILED');
      cy.wrap($row).find('.validation-header-label')
        .should('contain.text', 'Validation failed — issues found in this document');
      // A next step is offered: retry/re-upload, manual review, or the 24 h block notice.
      cy.wrap($row).find('.doc-action-btn--retry, .doc-action-btn--reupload, .manual-review-btn, .manual-review-note, .upload-blocked-note')
        .should('exist');
    } else if ($row.find('.stale-badge').length) {
      cy.log(`${title}: STALE`);
      cy.wrap($row).should('contain.text', 'Something went wrong while verifying this document.');
    } else {
      cy.wrap($row).find('.returned-badge').should('contain.text', 'RETURNED');
    }
  });
}

PAGES.forEach((page) => {
  describe(`XVI-FC Grant | ULB — ${page.name} Financial Statements real upload`, () => {
    beforeEach(function () {
      loginAsUlb();
      forbidOneWayActions();
      cy.intercept('GET', `**/api/v2/xvi-fc/annual-account/upload-config/${page.type}?*`).as('config');
      cy.intercept('GET', `**/api/v2/xvi-fc/annual-account/by-ulb/*/*?section=${page.section}`).as('byUlb');
      visitWorkspacePage(page.route);
      cy.wait('@config').its('response.body').then((b: any) => cy.wrap(b.data ?? b).as('cfg'));
      // by-ulb returns { data: null } until the first upload.
      cy.wait('@byUlb').its('response.body').then((b: any) => {
        if (!isEditable(b.data)) {
          cy.log(`${page.name} section is locked/exempted — nothing can be uploaded`);
          this.skip();
        }
      });
      cy.get(ROWS, { timeout: 20000 }).should('have.length.at.least', 1);
    });

    afterEach(() => {
      expect(forbidden, 'one-way actions attempted').to.be.empty;
    });

    it('uploads the matching statement into each required slot and reports every verdict', () => {
      cy.intercept('POST', '**/api/v2/xvi-fc/annual-account/confirm-upload').as('confirmUpload');
      cy.intercept('DELETE', '**/api/v2/xvi-fc/annual-account/*/documents/*').as('removeDoc');

      cy.get('@cfg').then((cfg: any) => {
        // So every run exercises a fresh upload: remove each required document
        // that already PASSED (Delete → "Remove and re-upload"), which frees the
        // slot for the upload below.
        cy.get(ROWS).then(($rows) => {
          const passed = cfg.data
            .filter((_: any, i: number) => !$rows[i].querySelector('.optional-badge'))
            .filter((_: any, i: number) => $rows[i].querySelector('.doc-action-btn--delete'));
          cy.log(`Removing ${passed.length} passed document(s) to upload them again`);
          passed.forEach((doc: any) => {
            rowFor(doc.label).find('.doc-action-btn--delete').click();
            cy.contains('.ulb-dialog__title', 'Remove this document?').should('be.visible');
            cy.contains('.ulb-dialog__actions button', 'Remove and re-upload').click();
            cy.wait('@removeDoc').its('response.statusCode').should('be.oneOf', [200, 204]);
            rowFor(doc.label).find('.doc-action-btn--upload', { timeout: 20000 }).should('exist');
          });
        });

        cy.get(ROWS).then(($rows) => {
          // Rows render in config order, so row i is document cfg.data[i].
          const targets = cfg.data
            .map((doc: any, i: number) => ({ doc, row: $rows[i] }))
            .filter(({ row }: any) => !row.querySelector('.optional-badge'))
            .filter(({ row }: any) => !row.querySelector('.passed-badge, .file-chip--passed'))
            .filter(({ row }: any) => row.querySelector('.doc-action-btn--upload, .doc-action-btn--reupload'));
          cy.log(`Uploading ${targets.length} document(s): ${targets.map((t: any) => t.doc.key).join(', ') || 'none'}`);

          targets.forEach(({ doc }: any) => {
            rowFor(doc.label).find(UPLOAD_BUTTONS).first().click();
            cy.get('input[type="file"][accept=".pdf"]')
              .selectFile(`${FIXTURES}/${page.type}/${doc.key}.pdf`, { force: true });
            cy.wait('@confirmUpload').then(({ response }) => {
              expect(response!.statusCode, `confirm-upload for ${doc.key}`).to.be.oneOf([200, 201]);
              const body = response!.body.data ?? response!.body;
              expect(body.docId).to.eq(doc.key);
              expect(body.versionLabel).to.match(/^v\d+$/);
            });
            rowFor(doc.label).find('.chip-filename', { timeout: 20000 }).should('contain.text', `${doc.key}.pdf`);
          });
        });

        // Wait for every required document's verdict, then check each is reported.
        const required = cfg.data.filter((d: any) => d.required !== false && !/optional/i.test(d.placeholder ?? ''));
        required.forEach((doc: any) => {
          rowFor(doc.label).then(($row) => {
            if ($row.find('.optional-badge').length || !$row.find('.chip-filename').length) return;
            cy.wrap($row).find(VERDICT, { timeout: VERIFICATION_TIMEOUT }).should('exist');
            expectVerdictShown(doc.label);
          });
        });
      });

      // Verdicts are stored server-side: the same picture after a reload.
      cy.get(ROWS).then(($rows) => {
        const before = $rows.toArray().map((r) => (r.querySelector('.passed-badge, .file-chip--passed') ? 'passed'
          : r.querySelector('.failed-badge') ? 'failed' : r.querySelector('.stale-badge') ? 'stale' : 'other'));
        cy.reload();
        cy.get(ROWS, { timeout: 20000 }).should('have.length', $rows.length).then(($after) => {
          const after = $after.toArray().map((r) => (r.querySelector('.passed-badge, .file-chip--passed') ? 'passed'
            : r.querySelector('.failed-badge') ? 'failed' : r.querySelector('.stale-badge') ? 'stale' : 'other'));
          expect(after, 'verdicts after reload').to.deep.eq(before);
        });
      });

      // Progress + Submit reflect the verdicts. Submit is only opened and cancelled.
      cy.get(ROWS).then(($rows) => {
        const required = $rows.toArray().filter((r) => !r.querySelector('.optional-badge'));
        const passed = required.filter((r) => r.querySelector('.passed-badge, .file-chip--passed')).length;
        cy.log(`${page.name}: ${passed} of ${required.length} required documents passed verification`);
        cy.contains(`${passed} of ${required.length} verified`).should('be.visible');
        if (passed < required.length) {
          cy.get('button.confirm-btn').should('be.disabled');
          return;
        }
        cy.get('button.confirm-btn').should('be.enabled').click();
        cy.contains('.ulb-dialog__title', 'Submit to State DMA?').should('be.visible');
        cy.contains('.ulb-dialog__actions button', 'Submit to State DMA').should('be.disabled');
        cy.get('.ulb-dialog__declaration input[type="checkbox"]').check({ force: true });
        cy.contains('.ulb-dialog__actions button', 'Submit to State DMA').should('be.enabled');
        cy.contains('.ulb-dialog__actions button', 'Cancel').click();
        cy.get('.ulb-dialog__title').should('not.exist');
      });
    });

    it('the Conditions page shows the section as in progress', () => {
      cy.intercept('GET', '**/api/v2/xvi-fc/form-status/*/*').as('formStatus');
      visitWorkspacePage('ulb-forms');
      cy.wait('@formStatus').its('response.body.data').then((s: any) => {
        const id = s[page.section]?.form_status_id;
        expect(id, `${page.name} form_status_id after uploads`).to.be.oneOf([2, 4, 6, 16]);
        const label = id === 2 ? 'Continue Uploading' : 'Reupload';
        cy.contains('.condition-row', page.conditionTitle).find('.condition-action-btn').should('contain.text', label);
      });
    });
  });
});

describe('XVI-FC Grant | ULB — Audited optional document upload and removal', () => {
  const NOTES = 'Notes to Account';

  beforeEach(function () {
    loginAsUlb();
    forbidOneWayActions();
    cy.intercept('GET', '**/api/v2/xvi-fc/annual-account/by-ulb/*/*?section=auditedData').as('byUlb');
    visitWorkspacePage('upload-audited');
    cy.wait('@byUlb').its('response.body').then((b: any) => { if (!isEditable(b.data)) this.skip(); });
    cy.get(ROWS, { timeout: 20000 }).should('have.length.at.least', 1);
    cy.get('body').then(($b) => {
      if (!$b.find(`${ROWS}:contains("${NOTES}") .doc-action-btn`).length) {
        cy.log('Notes to Account row is missing or has no actions — skipping');
        this.skip();
      }
    });
  });

  afterEach(() => {
    expect(forbidden, 'one-way actions attempted').to.be.empty;
  });

  // Notes to Account is optional and skips AI verification, so a valid PDF
  // passes straight away — which makes the Remove flow testable, and the test
  // removes the file again at the end.
  it('passes the optional Notes upload at once, then removes it', () => {
    cy.intercept('POST', '**/api/v2/xvi-fc/annual-account/confirm-upload').as('confirmUpload');
    cy.intercept('DELETE', '**/api/v2/xvi-fc/annual-account/*/documents/*').as('removeDoc');

    cy.contains(ROWS, NOTES).then(($row) => {
      if (!$row.find(UPLOAD_BUTTONS).length) return; // already uploaded by an earlier run
      cy.wrap($row).find(UPLOAD_BUTTONS).first().click();
      cy.get('input[type="file"][accept=".pdf"]')
        .selectFile(`${FIXTURES}/audited/balance-sheet-schedules.pdf`, { force: true });
      cy.wait('@confirmUpload').its('response.body').then((b: any) => {
        expect((b.data ?? b).processingStatus, 'Notes skip OCR').to.eq('PASSED');
      });
    });
    // Optional documents show the green "passed" file chip without a PASSED label.
    cy.contains(ROWS, NOTES).find('.file-chip--passed', { timeout: 30000 }).should('exist');

    // Remove: the dialog explains the consequence; Cancel keeps the file.
    cy.contains(ROWS, NOTES).find('.doc-action-btn--delete').click();
    cy.contains('.ulb-dialog__title', 'Remove this document?').should('be.visible');
    cy.contains('.ulb-dialog__desc', 'This document has already passed validation.').should('be.visible');
    cy.contains('.ulb-dialog__actions button', 'Cancel').click();
    cy.contains(ROWS, NOTES).find('.file-chip--passed').should('exist');

    // Confirm removes it and the row is back to "Upload".
    cy.contains(ROWS, NOTES).find('.doc-action-btn--delete').click();
    cy.contains('.ulb-dialog__actions button', 'Remove and re-upload').click();
    cy.wait('@removeDoc').its('response.statusCode').should('be.oneOf', [200, 204]);
    cy.contains(ROWS, NOTES).find('.doc-action-btn--upload', { timeout: 20000 }).should('exist');
    cy.contains(ROWS, NOTES).find('.file-chip--passed').should('not.exist');
  });
});
