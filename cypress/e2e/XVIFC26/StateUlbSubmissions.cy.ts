/**
 * XVI-FC Grant Portal — STATE "ULB Submissions" (Review): the form-wise list
 * of ULBs and the per-ULB review page.
 * URLs: /fc/xvifc/{yearId}/ulb-submissions,
 *       /fc/xvifc/{yearId}/ulb-submissions/{ulbId}/review?section=...
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (state-module/ulb-submissions) and checked against staging.
 *
 * Read-only: every write is blocked and the afterEach fails the test if one is
 * attempted (per-document Approve/Undo would otherwise fire on a single click).
 * Expected values come from the live API responses.
 *
 * The State can only decide a form while it is "Under Review by State". The
 * staging test ULB ("Test") is not at that stage, so the review-controls block
 * loads its REAL audited data with the response's status/permissions switched
 * to Under Review — enough to open each review control, check its validation,
 * and cancel. Nothing is sent.
 */
import { blockWrites, loginAsState, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const TEST_ULB = 'Test';
const FORMS = ['Audited Statements', 'Provisional Statements', 'PFMS Bank Account', 'Service Level Benchmarks', 'Detailed Utilisation Report'];
const CARDS = ['ULB Not Started', 'ULB In Progress', 'Exemption Status', 'Under Review by State', 'Approved by State', 'Returned by State', 'Under Review by MoHUA'];
const LIST_GET = '**/api/v2/xvi-fc/annual-account/state/ulb-submissions?*';

let blockedWrites: string[] = [];

beforeEach(() => {
  loginAsState();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

function openList() {
  cy.intercept('GET', LIST_GET).as('list');
  visitWorkspacePage('ulb-submissions');
  cy.wait('@list').its('response.body.data').as('listData');
}

/** Finds the test ULB's id through the list (Audited, "ULB In Progress" bucket + search). */
function findTestUlbId() {
  openList();
  cy.contains('button.stat-card', 'ULB In Progress').click();
  cy.wait('@list');
  cy.get('input[aria-label="Search ULB name"]').type(TEST_ULB);
  cy.wait('@list').its('response.body.data.rows').then((rows: any[]) => {
    const row = rows.find((r) => r.ulbName === TEST_ULB) ?? rows[0];
    expect(row, `a "${TEST_ULB}" row`).to.exist;
    cy.wrap(row.ulbId).as('ulbId');
  });
}

describe('XVI-FC Grant | STATE — ULB Submissions list', () => {
  beforeEach(() => openList());

  it('shows the heading, form selector and status cards', () => {
    cy.contains('h1.page-title', 'Review ULB Submissions').should('be.visible');
    cy.contains('.form-wise-badge', 'Form-wise Review').should('be.visible');
    cy.get('.fy-badge').invoke('text').should('match', /^FY \d{4}-\d{2}$/);
    cy.get('button.stat-card').should('have.length', CARDS.length);
    CARDS.forEach((c) => cy.contains('button.stat-card .stat-card__label', c).should('exist'));
    cy.get('#ulb-submissions-form').click();
    FORMS.forEach((f) => cy.contains('mat-option', f).should('be.visible'));
    cy.get('body').type('{esc}');
  });

  it('opens on "Under Review by State" with counts from the API', () => {
    cy.get('button.stat-card--active').should('contain.text', 'Under Review by State');
    cy.wait(0); // keep alias order explicit
    cy.get('@listData').then((d: any) => {
      cy.get('p.page-subtitle').invoke('text').then((t) => {
        const total = Number((t.match(/(\d+) ULBs total/) ?? [])[1]);
        expect(total, 'ULBs total').to.be.at.least(d.total ?? 0);
      });
      cy.get('table[mat-table] tbody tr.mat-mdc-row').should('have.length', d.rows.length);
    });
  });

  it('filters by status card on the server', () => {
    cy.contains('button.stat-card', 'ULB In Progress').click();
    cy.wait('@list').its('request.url').should('include', 'status=IN_PROGRESS');
    cy.get('button.stat-card--active').should('contain.text', 'ULB In Progress');
    // No review action in buckets with nothing to review yet.
    cy.contains('th', /Action/i).should('not.exist');
  });

  it('searches ULBs by name', () => {
    cy.contains('button.stat-card', 'ULB In Progress').click();
    cy.wait('@list');
    cy.get('input[aria-label="Search ULB name"]').type(TEST_ULB);
    cy.wait('@list').then(({ request, response }) => {
      expect(request.url).to.include(`search=${TEST_ULB}`);
      const rows = response!.body.data.rows;
      cy.get('table[mat-table] tbody tr.mat-mdc-row').should('have.length', rows.length);
    });
    cy.get('input[aria-label="Search ULB name"]').clear().type('zzz-no-such-ulb');
    cy.contains('No ULBs found for the selected filters.').should('be.visible');
  });

  it('switches form and calls that form’s list', () => {
    cy.intercept('GET', '**/api/v2/xvi-fc/bank-account/state/ulb-submissions?*').as('pfmsList');
    cy.get('#ulb-submissions-form').click();
    cy.contains('mat-option', 'PFMS Bank Account').click();
    cy.wait('@pfmsList').its('response.statusCode').should('eq', 200);
    cy.location('search').should('include', 'form=PFMS');
    cy.contains('h2', 'PFMS Bank Account — All ULBs').should('be.visible');
    cy.contains('button.stat-card', 'Exemption Status').should('be.disabled');

    cy.intercept('GET', '**/api/v2/xvi-fc/ulb/slb/state/ulb-submissions?*').as('slbList');
    cy.get('#ulb-submissions-form').click();
    cy.contains('mat-option', 'Service Level Benchmarks').click();
    cy.wait('@slbList');
    ['Under Review by State', 'Returned by State', 'Under Review by MoHUA']
      .forEach((c) => cy.contains('button.stat-card', c).should('be.disabled'));
    cy.contains('button', 'Approve all remaining').should('not.exist');
  });

  it('explains what the system checked for the selected form', () => {
    cy.get('button.system-checks-trigger').should('contain.text', 'Audited Statements').click();
    cy.get('button.system-checks-trigger').should('have.attr', 'aria-expanded', 'true');
    cy.contains('The document type, ULB name and financial year all match').should('be.visible');
    cy.contains('Checks are AI-assisted and can be wrong. A passed check is not an approval.').should('be.visible');
  });

  it('exports all ULB submissions to Excel', () => {
    cy.intercept('GET', '**/api/v2/xvi-fc/state/ulb-submissions/export?*').as('export');
    cy.contains('button.export-data-btn', 'Export Data').click();
    cy.wait('@export').then(({ response }) => {
      expect(response!.statusCode).to.eq(200);
      expect(String(response!.headers['content-disposition'])).to.match(/_all_ulb_submissions_\d{2}_\d{2}_\d{4}\.xlsx/);
    });
  });

  it('a PFMS row opens the review page on the PFMS tab', function () {
    cy.intercept('GET', '**/api/v2/xvi-fc/bank-account/state/ulb-submissions?*').as('pfmsList');
    visitWorkspacePage('ulb-submissions?form=PFMS&status=RETURNED_BY_STATE');
    cy.wait('@pfmsList').its('response.body.data.rows').then((rows: any[]) => {
      const row = rows.find((r) => r.bankAccountId);
      if (!row) this.skip();
      cy.contains('tr', row.ulbName).contains('button.row-action-btn', /View|Review/).click();
      cy.location('pathname').should('match', /\/ulb-submissions\/[a-f0-9]{24}\/review$/);
      cy.location('search').should('include', 'section=PFMS');
      cy.get('button.section-tab--active').should('contain.text', 'PFMS');
    });
  });
});

describe('XVI-FC Grant | STATE — ULB review page', () => {
  beforeEach(() => {
    findTestUlbId();
  });

  it('shows all five form tabs and returns to the list', () => {
    cy.get('@ulbId').then((id) => visitWorkspacePage(`ulb-submissions/${id}/review`));
    cy.contains('h1.ulb-name', TEST_ULB).should('be.visible');
    ['Audited', 'Provisional', 'PFMS', 'Service Level Benchmarks', 'Detailed Utilisation Report']
      .forEach((t) => cy.contains('button.section-tab', t).should('be.visible'));
    cy.get('button.section-tab--active').should('contain.text', 'Audited');
    cy.contains('button.back-btn', 'Back to Submissions').click();
    cy.location('pathname').should('match', /\/ulb-submissions$/);
    cy.location('search').should('include', 'form=auditedData');
  });

  it('Audited tab lists the documents with their verification result', () => {
    cy.intercept('GET', '**/annual-account/by-ulb/*/*?section=auditedData').as('audited');
    cy.get('@ulbId').then((id) => visitWorkspacePage(`ulb-submissions/${id}/review`));
    cy.wait('@audited').its('response.body.data').then((acct: any) => {
      cy.contains('h2', /Documents Review/i).should('be.visible');
      const docs = (acct?.data?.documents ?? []).filter((d: any) => d.currentUpload);
      if (docs.length && docs.every((d: any) => d.processingStatus === 'PASSED')) {
        cy.contains('.checks-badge', 'Automated checks passed').should('be.visible');
      }
      cy.get('.doc-list .doc-row').should('have.length.at.least', docs.length);
      cy.get('.doc-list .doc-row .passed-badge').should('have.length.at.least', docs.filter((d: any) => d.processingStatus === 'PASSED').length - 1);
      // Not under review: no section decision bar.
      if (!acct?.data?.permissions?.canApprove) cy.get('.page-footer').should('not.exist');
    });
  });

  it('View PDF opens the uploaded document', function () {
    cy.get('@ulbId').then((id) => visitWorkspacePage(`ulb-submissions/${id}/review`));
    cy.window().then((win) => cy.stub(win, 'open').as('open'));
    cy.get('.doc-list .doc-row', { timeout: 20000 }).should('have.length.greaterThan', 0);
    cy.get('body').then(($b) => { if (!$b.find('button.view-pdf-btn:not([disabled])').length) this.skip(); });
    cy.get('button.view-pdf-btn:not([disabled])').first().click();
    cy.get('@open').should('have.been.calledOnce');
  });

  it('PFMS, DUR and SLB tabs show their submitted data read-only', () => {
    cy.get('@ulbId').then((id) => visitWorkspacePage(`ulb-submissions/${id}/review?section=PFMS`));
    cy.contains('h2', /PFMS Bank Account Details/i).should('be.visible');
    cy.get('.doc-status-badge').should('not.be.empty');
    ['Bank Name', 'Account Number', 'IFSC Code'].forEach((l) => cy.contains('.pfms-detail-label', new RegExp(l, 'i')).should('exist'));

    cy.contains('button.section-tab', 'Detailed Utilisation Report').click();
    cy.contains('h2', /Detailed Utilisation Report/i).should('be.visible');
    cy.contains('Tied Grant Utilisation Report').should('be.visible');
    cy.contains('Untied Grant Utilisation Report').should('be.visible');

    cy.contains('button.section-tab', 'Service Level Benchmarks').click();
    cy.contains('.slb-approved-banner', 'deemed approved on submission').should('be.visible');
    cy.get('table.slb-indicator-table tbody tr').should('have.length.greaterThan', 20);
    cy.get('.page-footer').should('not.exist');
  });

  it('shows the decision history', () => {
    cy.intercept('GET', '**/api/v2/xvi-fc/bank-account/*/logs').as('pfmsLogs');
    cy.get('@ulbId').then((id) => visitWorkspacePage(`ulb-submissions/${id}/review?section=PFMS`));
    cy.contains('button.pfms-history-toggle', 'View History').should('be.visible').click();
    cy.wait('@pfmsLogs').its('response.statusCode').should('eq', 200);
    cy.get('li.history-item, :contains("No history yet.")').should('exist');
  });
});

describe('XVI-FC Grant | STATE — Review controls (section under review)', () => {
  // Loads the real audited data with the section presented as Under Review by
  // State and the State allowed to decide — every write stays blocked.
  beforeEach(() => {
    findTestUlbId();
    cy.intercept('GET', '**/annual-account/by-ulb/*/*?section=auditedData', (req) => {
      req.continue((res) => {
        const sec = res.body?.data?.data;
        if (!sec) return;
        sec.form_status = 'UNDER_REVIEW_BY_STATE';
        sec.form_status_id = 3;
        sec.permissions = { ...sec.permissions, canReview: true, canApprove: true, canUndoApproval: false };
        sec.stateDecision = null;
        (sec.documents ?? []).forEach((d: any) => { d.stateDecision = null; });
      });
    }).as('audited');
    cy.get('@ulbId').then((id) => visitWorkspacePage(`ulb-submissions/${id}/review`));
    cy.wait('@audited');
    cy.get('.doc-list .doc-row', { timeout: 20000 }).should('have.length.greaterThan', 0);
  });

  it('shows Return Section and Approve Section', () => {
    cy.contains('.page-footer button', 'Return Section').scrollIntoView().should('be.visible');
    cy.contains('.page-footer button', 'Approve Section').scrollIntoView().should('be.visible').and('be.enabled');
  });

  it('Approve Section asks for confirmation (cancelled)', () => {
    cy.contains('.page-footer button', 'Approve Section').scrollIntoView().click();
    cy.contains('.confirm-dialog-title', 'Approve this section?').should('be.visible');
    cy.contains('You can still undo this from here until you generate the claim letter.').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.get('.confirm-dialog-title').should('not.exist');
  });

  it('Return Section needs a 10–200 character note (cancelled)', () => {
    cy.contains('.page-footer button', 'Return Section').scrollIntoView().click();
    cy.contains('Return this section to the ULB?').should('be.visible');
    cy.get('body').then(($b) => {
      if (!$b.find('.note-dialog-char-count').length) {
        // Every document already decided → plain confirm instead of the note dialog.
        cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
        return;
      }
      cy.contains('mat-dialog-container button', 'Return section').should('be.disabled');
      cy.get('mat-dialog-content textarea').type('Too short');
      cy.get('.note-dialog-char-count').should('contain.text', '9 / 200').and('have.class', 'note-dialog-char-count--invalid');
      cy.contains('mat-dialog-container button', 'Return section').should('be.disabled');
      cy.get('mat-dialog-content textarea').type(' — Balance Sheet figures differ');
      cy.contains('mat-dialog-container button', 'Return section').should('be.enabled');
      cy.get('mat-dialog-content textarea').type('x'.repeat(200));
      cy.contains('mat-dialog-container button', 'Return section').should('be.disabled');
      cy.contains('mat-dialog-container button', 'Cancel').click();
      cy.contains('Return this section to the ULB?').should('not.exist');
    });
  });

  it('returning one document needs a reason (cancelled)', function () {
    cy.get('body').then(($b) => {
      if (!$b.find('.doc-action-btn--return:not([disabled])').length) this.skip();
    });
    cy.get('.doc-action-btn--return:not([disabled])').first().click();
    // The inline panel for that document opens; only its textarea is visible.
    cy.get('textarea.return-box-textarea:visible').should('have.length', 1).as('note');
    cy.get('@note').closest('.return-box-wrapper').as('panel');
    cy.get('@panel').find('.return-box-char-count').should('contain.text', '0 / 200 · minimum 10 characters');
    cy.get('@panel').find('button.return-box-submit').should('be.disabled');
    cy.get('@note').should('have.attr', 'maxlength', '200').type('Page 3 is unreadable');
    cy.get('@panel').find('button.return-box-submit').should('be.enabled');
    cy.get('@panel').contains('button', 'Cancel').click();
    cy.get('textarea.return-box-textarea:visible').should('not.exist');
  });
});
