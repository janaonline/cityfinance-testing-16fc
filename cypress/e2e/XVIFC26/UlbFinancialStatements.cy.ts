/**
 * XVI-FC Grant Portal — ULB "Audited Financial Statements" and "Provisional
 * Financial Statements" upload pages. Both are the same Angular component
 * (ulb-forms/upload-documents) with a different uploadType, so one spec runs
 * the same checks against each.
 * URLs: /fc/xvifc/{ulbId}/upload-audited, /fc/xvifc/{ulbId}/upload-provisional
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * and checked against staging.
 *
 * The document list, size limit and submit label come from the DB via
 * GET .../annual-account/upload-config/{type}; the section's status and each
 * document's verification state from GET .../annual-account/by-ulb/...
 * (data: null until the ULB uploads anything). The spec reads both and
 * branches on them, so it holds whatever state the shared data is in:
 * editable-section tests skip (pending) when the section is locked or
 * exempted, and the locked-view test skips while it is editable.
 *
 * IMPORTANT: selecting a file that passes the client checks uploads it at once
 * (S3 PUT + confirm-upload + OCR) — there is no Save step. Only files the page
 * rejects before any network call are used, and every API write is blocked.
 */
import { blockWrites, loginAsUlb, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const EDITABLE_STATUS_IDS = new Set([1, 2, 4, 6, 16]);
const LOCKED_BANNERS: Record<number, string> = {
  3: 'This section has been submitted to State DMA and is now locked for review.',
  5: 'This section has been approved by the state and is now under review by MoHUA.',
  7: 'This section has been approved by MoHUA. No further changes are needed.',
  8: 'This section has been approved by your State DMA and is now locked.',
  9: 'awaiting claim letter generation',
};

const PAGES = [
  { name: 'Audited', route: 'upload-audited', type: 'audited', section: 'auditedData', docSet: 'Audited Financial Statements' },
  { name: 'Provisional', route: 'upload-provisional', type: 'provisional', section: 'unauditedData', docSet: 'Provisional Financial Statements' },
];

let blockedWrites: string[] = [];

/** by-ulb returns { data: null } before the first upload. */
function sectionOf(body: any): any {
  return body?.data?.data ?? null;
}

function sectionMode(body: any): 'editable' | 'locked' | 'exempted' {
  const exemption = body?.data?.exemptionStatus;
  const section = sectionOf(body);
  const id = section?.form_status_id ?? 1;
  if (id === 12 || exemption === 'APPROVED') return 'exempted';
  if (exemption === 'PENDING' || !EDITABLE_STATUS_IDS.has(id)) return 'locked';
  return 'editable';
}

PAGES.forEach((page) => {
  function openPage() {
    cy.intercept('GET', `**/api/v2/xvi-fc/annual-account/upload-config/${page.type}?*`).as('config');
    cy.intercept('GET', `**/api/v2/xvi-fc/annual-account/by-ulb/*/*?section=${page.section}`).as('byUlb');
    visitWorkspacePage(page.route);
    cy.wait('@config').its('response.body').then((b: any) => cy.wrap(b.data ?? b).as('cfg'));
    cy.wait('@byUlb').its('response.body').as('account');
    cy.get('.doc-row:not(.doc-row--skeleton)', { timeout: 20000 }).should('have.length.at.least', 1);
  }

  function requireMode(ctx: Mocha.Context, wanted: 'editable' | 'locked') {
    cy.get('@account').then((body: any) => {
      const mode = sectionMode(body);
      if (mode !== wanted) {
        cy.log(`${page.name} section is ${mode} on staging — skipping ${wanted} tests`);
        ctx.skip();
      }
    });
  }

  /** Clicks Upload/Re-upload on the first row that has one, then selects `file`. */
  function pickFileOnFirstUploadableRow(file: Cypress.FileReference | string) {
    cy.get('.doc-action-btn--upload, .doc-action-btn--reupload').first().closest('.doc-row').as('row');
    cy.get('@row').find('.doc-action-btn--upload, .doc-action-btn--reupload').first().click();
    cy.get('input[type="file"][accept=".pdf"]').selectFile(file as any, { force: true });
  }

  describe(`XVI-FC Grant | ULB — ${page.name} Financial Statements page`, () => {
    beforeEach(() => {
      loginAsUlb();
      blockedWrites = blockWrites();
      openPage();
    });

    afterEach(() => {
      expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
    });

    it('shows the heading, description and guidance notes', () => {
      cy.contains('h1.page-heading', 'Upload Documents').should('be.visible');
      cy.get('@cfg').then((cfg: any) => {
        cy.get('.upload-description').should('contain.text', cfg.meta.description);
      });
      cy.contains('* Required documents must be uploaded before submitting.').should('be.visible');
      cy.contains('These automated checks use AI and may occasionally produce incorrect results.').should('be.visible');
    });

    it(`links the support email for the ${page.docSet}`, () => {
      cy.get('.support-banner').should('contain.text', '16fc.grant@cityfinance.in');
      cy.get('.support-banner a[href^="mailto:16fc.grant@cityfinance.in"]')
        .should('have.attr', 'href')
        .and('include', encodeURIComponent(page.docSet));
    });

    it('lists every configured document, marking optional ones', () => {
      cy.get('@cfg').then((cfg: any) => {
        cy.get('.doc-row:not(.doc-row--skeleton)').should('have.length', cfg.data.length);
        cfg.data.forEach((doc: any, i: number) => {
          cy.get('.doc-row:not(.doc-row--skeleton)').eq(i).within(() => {
            cy.get('.doc-title').should('contain.text', doc.label);
            if (doc.placeholder) cy.get('.doc-subtitle').should('contain.text', doc.placeholder);
          });
        });
      });
    });

    it('counts verified required documents', () => {
      cy.get('@account').then((body: any) => {
        const docs: any[] = sectionOf(body)?.documents ?? [];
        cy.get('.doc-row:not(.doc-row--skeleton)').then(($rows) => {
          const required = $rows.filter((_, r) => !r.querySelector('.optional-badge'));
          const passed = required.filter((_, r) => !!r.querySelector('.passed-badge')).length;
          cy.contains(`${passed} of ${required.length} verified`).should('be.visible');
          if (!docs.length) expect(passed, 'nothing uploaded yet').to.eq(0);
        });
      });
    });

    it('shows uploaded files by name', function () {
      cy.get('@account').then((body: any) => {
        const uploaded = (sectionOf(body)?.documents ?? []).filter((d: any) => d.currentUpload?.file?.originalName);
        if (!uploaded.length) this.skip();
        uploaded.forEach((d: any) => cy.contains('.chip-filename', d.currentUpload.file.originalName).should('exist'));
      });
    });
  });

  describe(`XVI-FC Grant | ULB — ${page.name} Financial Statements editable section`, () => {
    beforeEach(function () {
      loginAsUlb();
      blockedWrites = blockWrites();
      openPage();
      requireMode(this, 'editable');
    });

    afterEach(() => {
      expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
    });

    it('keeps Submit disabled until every required document has passed', () => {
      cy.get('@cfg').then((cfg: any) => {
        cy.contains('button.confirm-btn', cfg.meta.confirmLabel).scrollIntoView().should('be.visible');
      });
      cy.get('.doc-row:not(.doc-row--skeleton)').then(($rows) => {
        const required = $rows.filter((_, r) => !r.querySelector('.optional-badge'));
        const allPassed = required.length > 0 && required.filter((_, r) => !!r.querySelector('.passed-badge')).length === required.length;
        cy.get('button.confirm-btn').should(allPassed ? 'be.enabled' : 'be.disabled');
      });
      cy.get('.footer-note').invoke('text').should('match', /All documents must pass verification|re-upload the returned document/);
    });

    it('rejects a file that is not a PDF', function () {
      cy.get('body').then(($b) => { if (!$b.find('.doc-action-btn--upload, .doc-action-btn--reupload').length) this.skip(); });
      pickFileOnFirstUploadableRow('cypress/fixtures/invalid-test-file.txt');
      cy.get('@row').find('.file-chip--error').should('contain.text', 'Please upload a PDF file only.');
    });

    it('rejects an empty PDF', function () {
      cy.get('body').then(($b) => { if (!$b.find('.doc-action-btn--upload, .doc-action-btn--reupload').length) this.skip(); });
      pickFileOnFirstUploadableRow({ contents: Cypress.Buffer.alloc(0), fileName: 'empty.pdf', mimeType: 'application/pdf' });
      cy.get('@row').find('.file-chip--error')
        .should('contain.text', 'The selected file is empty. Please upload a valid file.');
    });

    it('rejects a ".pdf" whose contents are not a PDF', function () {
      cy.get('body').then(($b) => { if (!$b.find('.doc-action-btn--upload, .doc-action-btn--reupload').length) this.skip(); });
      pickFileOnFirstUploadableRow({ contents: Cypress.Buffer.from('not really a pdf'), fileName: 'statement.pdf', mimeType: 'application/pdf' });
      cy.get('@row').find('.file-chip--error').should('contain.text', 'Please upload a PDF file only.');
    });

    it('rejects a PDF over the configured size limit', function () {
      cy.get('body').then(($b) => { if (!$b.find('.doc-action-btn--upload, .doc-action-btn--reupload').length) this.skip(); });
      cy.get('@cfg').then((cfg: any) => {
        const maxMb = Number(cfg.data[0]?.maxFileSize) || 50;
        pickFileOnFirstUploadableRow({
          contents: Cypress.Buffer.alloc((maxMb + 1) * 1024 * 1024),
          fileName: 'statement.pdf',
          mimeType: 'application/pdf',
        });
        cy.get('@row').find('.file-chip--error')
          .should('contain.text', `File size exceeds ${maxMb} MB. Please compress or split the file and try again.`);
      });
    });
  });

  describe(`XVI-FC Grant | ULB — ${page.name} Financial Statements locked section`, () => {
    beforeEach(function () {
      loginAsUlb();
      blockedWrites = blockWrites();
      openPage();
      requireMode(this, 'locked');
    });

    afterEach(() => {
      expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
    });

    it('shows the lock banner and no upload actions or Submit', () => {
      cy.get('@account').then((body: any) => {
        const id = sectionOf(body)?.form_status_id;
        cy.get('.section-locked-banner').should('be.visible')
          .and('contain.text', LOCKED_BANNERS[id] ?? 'locked');
      });
      cy.get('.doc-action-btn').should('not.exist');
      cy.get('button.confirm-btn').should('not.exist');
    });
  });
});
