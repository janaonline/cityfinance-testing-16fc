/**
 * XVI-FC Grant Portal — ULB "Detailed Utilisation Report (DUR)" form.
 * URL: /fc/xvifc/{yearId}/dur
 *
 * Every selector, message, and behavior below was confirmed against the
 * live staging app (staging.cityfinance.in, census code 100002) before
 * being written — not assumed.
 *
 * Confirmed live:
 *   - Three steps: download templates, fill/sign/save as PDF, upload. The two
 *     template buttons (a.dur-template-btn) serve real .docx files.
 *   - Two required upload rows (.dur-upload-row): "Tied grant" and
 *     "Untied grant", sharing one hidden <input type="file" accept=".pdf">.
 *     An uploaded row shows a file chip with a PASSED/FAILED badge and the
 *     AI-validation results; an empty row shows an "Upload" button.
 *   - A non-PDF is rejected with "Please upload a PDF file only." and a file
 *     over 5 MB with "File size exceeds 5 MB. ..." — both in the browser,
 *     with no request sent. Reloading restores the server-side state.
 *   - "Submit to State DMA" was disabled while the tied grant row was FAILED.
 *
 * The upload rows' state is shared, server-side, and changes as people use
 * staging, so the assertions here hold for any combination of empty /
 * PASSED / FAILED rows rather than pinning the current one.
 *
 * NOT covered here: uploading a valid PDF (it really uploads, runs AI
 * validation, and replaces the ULB's current document — e.g. overwriting the
 * PASSED untied DUR with a FAILED one), "Request Manual Review", and
 * "Submit to State DMA". All are one-way writes on a shared account. As a
 * guard, every test here fails if the page sends any non-auth write request.
 */

export {}; // Makes this file its own module so top-level declarations
           // don't collide with same-named ones in other spec files.

const XVFCULB_ID = Cypress.env("XVFCULB_ID");
const XVIFCULB_pass = Cypress.env("XVIFCULB_pass");

const IDENTIFIER_INPUT = 'input[formcontrolname="identifier"]';
const PASSWORD_INPUT = 'input[formcontrolname="password"]';
const FILE_INPUT = 'app-dur > input[type="file"]';
const UPLOAD_ROW = '.dur-upload-row';
const UPLOAD_BUTTON_TEXT = /^\s*(Re-upload|Upload)\s*$/;

function loginAsUlb(censusCode = XVFCULB_ID, password = XVIFCULB_pass) {
  cy.visit("/fc/auth/login/16thFC");
  cy.contains('span.role-card__label', 'ULB').click();
  cy.get(IDENTIFIER_INPUT).type(censusCode, { force: true });
  cy.get(PASSWORD_INPUT).should('be.visible').click().type(password, { force: true, log: false });
  cy.contains('button', 'Sign In').click();

  cy.contains(/Continue|People and Roles/, { timeout: 20000 })
    .invoke('text')
    .then((text: string) => {
      if (text.includes('Continue')) {
        cy.contains(/Continue|People and Roles/).click();
      }
    });
  // Wait until we're inside a year workspace — the year picker also shows
  // "2026-27", so matching that text alone races the Continue click.
  cy.location('pathname', { timeout: 20000 }).should('match', /\/fc\/xvifc\/[a-f0-9]{24}\//);
}

// Navigates directly via the workspace's own URL — consistent with the SLB
// and PFMS specs.
function openDurForm() {
  cy.intercept('GET', '**/api/v2/xvi-fc/dur/by-ulb/**').as('durData');
  // Upload/Re-upload buttons render only after the action gates load;
  // clicking before then hits a row that is about to re-render.
  cy.intercept('GET', '**/api/v2/xvi-fc/dur/action-gates*').as('durGates');
  cy.url().then((currentUrl) => {
    const match = currentUrl.match(/^(.*\/fc\/xvifc\/[^/]+)\//);
    const workspaceBase = match ? match[1] : currentUrl.replace(/\/[^/]*$/, '');
    cy.visit(`${workspaceBase}/dur`);
  });
  cy.wait(['@durData', '@durGates'], { timeout: 20000 });
  cy.contains('h1', 'Detailed Utilisation Report', { timeout: 20000 }).should('be.visible');
  cy.get(UPLOAD_ROW).should('have.length', 2);
}

// Blocks (and records) any write the page attempts, so a regression that
// starts uploading on file selection can't silently mutate shared staging.
let blockedWrites: string[] = [];
function blockWrites() {
  blockedWrites = [];
  cy.intercept({ url: '**/api/**', method: /^(POST|PUT|PATCH|DELETE)$/ }, (req) => {
    if (req.url.includes('/api/v2/auth/')) return;
    blockedWrites.push(`${req.method} ${req.url}`);
    req.reply({ statusCode: 500, body: { message: 'Blocked by Cypress: DUR spec is read-only' } });
  });
}

// Selects a file through whichever row currently offers Upload/Re-upload
// (a FAILED row may offer neither — only "Request Manual Review"). The rows
// can re-render while loading, so the click goes through a fresh
// get().eq() query that Cypress can retry, not a saved element.
function selectFileViaAnyRow(fixture: string) {
  // The page fetches the DUR data a second time after it first renders, so
  // the buttons can appear late. .should() retries until one has rendered.
  let index = -1;
  cy.get(UPLOAD_ROW, { timeout: 20000 }).should(($rows) => {
    index = [...$rows].findIndex((r) =>
      Array.from(r.querySelectorAll('button')).some((b) => UPLOAD_BUTTON_TEXT.test(b.textContent || '')));
    expect(index, 'an upload row with an Upload/Re-upload button').to.be.at.least(0);
  });
  cy.then(() => {
    cy.get(UPLOAD_ROW).eq(index).contains('button', UPLOAD_BUTTON_TEXT).should('be.visible').click();
  });
  cy.get(FILE_INPUT).selectFile(fixture, { force: true });
}

describe("XVI-FC Grant | ULB — DUR form structure", () => {
  beforeEach(() => {
    blockWrites();
    loginAsUlb();
    openDurForm();
  });

  afterEach(() => {
    expect(blockedWrites, 'write requests sent by the page').to.be.empty;
  });

  it("shows the heading, reporting period, and AI-check disclaimer", () => {
    cy.contains('a', 'Detailed Utilisation Report (DUR)').should('be.visible'); // sidebar
    cy.contains('.upload-description', 'tied and untied grants your ULB received in FY 2025-26')
      .should('be.visible');
    cy.contains('These automated checks use AI and may occasionally produce incorrect results.')
      .should('be.visible');
    cy.contains('.dur-section-eyebrow', 'File the Detailed Utilisation Report').should('be.visible');
  });

  it("shows the three filing steps in order", () => {
    cy.get('.dur-step-title').should('have.length', 3).then(($titles) => {
      const titles = [...$titles].map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
      expect(titles[0]).to.eq('Download the DUR templates for FY 2026-27');
      expect(titles[1]).to.eq('Fill it in, get it signed, and save as PDF');
      expect(titles[2]).to.match(/^Upload the completed forms \*$/);
    });
    cy.contains('Use only the prescribed templates.').should('be.visible');
    cy.contains('the portal accepts PDF only').should('be.visible');
  });

  it("serves both DUR templates as downloadable .docx files", () => {
    const templates = [
      { label: 'Tied Grant Template', file: 'revised-Annexure-VI_Tied_Grant_DUR_Template.docx' },
      { label: 'Untied Grant Template', file: 'revised-Annexure-VI_Untied_Grant_DUR_Template.docx' },
    ];
    templates.forEach(({ label, file }) => {
      cy.contains('a.dur-template-btn', label)
        .should('be.visible')
        .and('have.attr', 'download');
      cy.contains('a.dur-template-btn', label)
        .should('have.attr', 'href', `assets/files/${file}`)
        .then(($a) => {
          cy.request({ url: ($a[0] as HTMLAnchorElement).href, encoding: 'binary' }).then((res) => {
            expect(res.status).to.eq(200);
            expect(res.headers['content-type']).to.include('wordprocessingml.document');
            expect(res.body.length).to.be.greaterThan(1000);
          });
        });
    });
  });

  it("shows required Tied and Untied upload rows, each either empty or with a validated file", () => {
    ['Tied grant', 'Untied grant'].forEach((label, i) => {
      cy.get(UPLOAD_ROW).eq(i).within(() => {
        cy.get('.dur-upload-label').should('contain.text', label);
        cy.get('.dur-upload-label .text-danger').should('have.text', '*');
        cy.root().then(($row) => {
          const chip = $row.find('.file-chip');
          if (chip.length) {
            cy.get('.chip-filename').invoke('text').should('match', /\.pdf$/i);
            cy.get('.file-chip').invoke('text').should('match', /PASSED|FAILED/);
          } else {
            cy.contains('button', UPLOAD_BUTTON_TEXT).scrollIntoView().should('be.visible');
          }
        });
      });
    });
    cy.get(FILE_INPUT).should('have.attr', 'accept', '.pdf');
    cy.contains('Accepted format: PDF only · Max 5 MB each').scrollIntoView().should('be.visible');
  });

  it("shows the validation issues and a manual-review option for any FAILED upload", () => {
    cy.get(UPLOAD_ROW).each(($row) => {
      if (!$row.find('.failed-badge').length) return;
      cy.wrap($row).within(() => {
        cy.contains('.validation-header-label', 'Validation failed — issues found in this document')
          .scrollIntoView().should('be.visible');
        cy.get('.validation-check-item').should('have.length.greaterThan', 0);
        cy.contains('button', 'Request Manual Review').scrollIntoView().should('be.visible');
      });
    });
  });

  // Observed live: disabled while the tied row was FAILED. Only the
  // "not every row PASSED => disabled" direction is asserted; what happens
  // when both pass hasn't been seen on staging yet.
  it("keeps Submit to State DMA disabled until both forms have PASSED", () => {
    cy.contains('.page-footer button', 'Cancel').scrollIntoView().should('be.visible');
    cy.get('app-dur').then(($dur) => {
      if ($dur.find('.passed-badge').length < 2) {
        cy.contains('button', 'Submit to State DMA').should('be.disabled');
      } else {
        cy.contains('button', 'Submit to State DMA').scrollIntoView().should('be.visible');
      }
    });
  });
});

describe("XVI-FC Grant | ULB — DUR upload validation", () => {
  beforeEach(() => {
    blockWrites();
    loginAsUlb();
    openDurForm();
  });

  afterEach(() => {
    expect(blockedWrites, 'write requests sent by the page').to.be.empty;
  });

  it("rejects a non-PDF file without uploading it", () => {
    selectFileViaAnyRow('cypress/fixtures/invalid-test-file.txt');
    cy.contains('Please upload a PDF file only.').scrollIntoView().should('be.visible');
  });

  it("rejects a PDF over 5 MB without uploading it", () => {
    selectFileViaAnyRow('cypress/fixtures/oversized-test-file.pdf');
    cy.contains('File size exceeds 5 MB. Please compress or split the file and try again.')
      .scrollIntoView().should('be.visible');
  });

  it("restores the saved uploads after a rejected file and a reload", () => {
    cy.get(UPLOAD_ROW).then(($before) => {
      const before = [...$before].map((r) => r.querySelector('.chip-filename')?.textContent?.trim() ?? '');
      selectFileViaAnyRow('cypress/fixtures/invalid-test-file.txt');
      cy.contains('Please upload a PDF file only.').scrollIntoView().should('be.visible');

      cy.reload();
      cy.wait(['@durData', '@durGates'], { timeout: 20000 });
      cy.contains('Please upload a PDF file only.').should('not.exist');
      cy.get(UPLOAD_ROW).should(($after) => {
        const after = [...$after].map((r) => r.querySelector('.chip-filename')?.textContent?.trim() ?? '');
        expect(after).to.deep.eq(before);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// NOT AUTOMATED — uploading a valid DUR PDF, "Request Manual Review", and
// "Submit to State DMA" are one-way writes on the shared staging ULB. An
// upload replaces the current document (bumping its version, e.g. v1 -> v2)
// and re-runs AI validation, so a dummy fixture would overwrite the PASSED
// untied DUR with a FAILED one. Automate in a *Mutating.cy.ts spec only
// against a disposable ULB, with a properly filled and signed DUR fixture.
// ---------------------------------------------------------------------------
