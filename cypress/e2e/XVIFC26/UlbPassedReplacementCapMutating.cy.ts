/**
 * XVI-FC Grant Portal — ULB cap on replacing a document that already PASSED (TS-1245).
 * URL: /fc/xvifc/{ulbId}/upload-audited
 *
 * !!! MUTATING: uploads and removes real files with the ULB account in .env, and
 * ends with the slot LOCKED (only a State/SO return unlocks it). Excluded from
 * default runs (*Mutating.cy.ts).
 *
 * Uses the optional "Notes to Account" slot: it skips the paid AI/OCR check and
 * passes at once, so the cap can be reached without paying for system checks.
 * The rule (cf-nest-api-v2 manual-review-cooldown.util.ts): removing a PASSED,
 * not-returned document counts; at MAX_PASSED_REPLACEMENTS (3) it is locked.
 */
import { loginAsUlb, visitWorkspacePage } from '../../support/xvifcSession';

export {};

const MAX = 3;
const NOTES = 'Notes to Account';
const ROWS = '.doc-row:not(.doc-row--skeleton)';
const UPLOAD_BUTTONS = '.doc-action-btn--upload, .doc-action-btn--reupload';
const FILE = 'cypress/fixtures/financial-statements/audited/balance-sheet-schedules.pdf';
const SUPPORT_EMAIL = '16fc.grant@cityfinance.in';
const LOCK_MESSAGE = `This document has already passed validation and has been replaced ${MAX} times, the maximum allowed.`;

let forbidden: string[] = [];

/** Lets uploads and removals through; refuses submit, manual review and retry. */
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

/** Every document object in the by-ulb response (they carry docId + processingStatus). */
function findDocs(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if ('docId' in node && 'processingStatus' in node) out.push(node);
  Object.values(node).forEach((v) => findDocs(v, out));
  return out;
}

function notesRow() {
  return cy.contains(ROWS, NOTES);
}

/** Opens the Audited page; yields the account id and the Notes slot as the server sees it. */
function openAudited(): Cypress.Chainable<{ accountId: string; notes: any; all: any[] }> {
  cy.intercept('GET', '**/api/v2/xvi-fc/annual-account/by-ulb/*/*?section=auditedData').as('byUlb');
  visitWorkspacePage('upload-audited');
  return cy.wait('@byUlb').then(({ request, response }) => {
    Cypress.env('BY_ULB_URL', request.url);
    const body: any = response!.body;
    cy.get(ROWS, { timeout: 20000 }).should('have.length.at.least', 1);
    const all = findDocs(body);
    const notes = all.find((d) => d.docId === 'notes-to-accounts') ?? null;
    const accountId = body?.data?.data?._id ?? body?.data?._id;
    return cy.wrap({ accountId, notes, all });
  });
}

/** The Notes slot straight from the API (no page, no browser cache). */
function fetchNotes(): Cypress.Chainable<any> {
  return cy.window().then((w) => {
    const t = w.localStorage.getItem('cf_access_token') || w.localStorage.getItem('id_token');
    return cy.request({
      url: Cypress.env('BY_ULB_URL'),
      headers: { Authorization: `Bearer ${t}`, 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    }).then((res) => findDocs(res.body).find((d) => d.docId === 'notes-to-accounts'));
  });
}

function uploadNotes() {
  cy.intercept('POST', '**/api/v2/xvi-fc/annual-account/confirm-upload').as('confirmUpload');
  notesRow().find(UPLOAD_BUTTONS).first().click();
  cy.get('input[type="file"][accept=".pdf"]').selectFile(FILE, { force: true });
  cy.wait('@confirmUpload', { timeout: 60000 }).its('response.body').then((b: any) => {
    expect((b.data ?? b).processingStatus, 'Notes skip OCR and pass at once').to.eq('PASSED');
  });
  notesRow().find('.file-chip--passed', { timeout: 30000 }).should('exist');
}

describe('XVI-FC Grant | ULB — cap on replacing a passed document (TS-1245, MUTATING)', () => {
  beforeEach(() => {
    loginAsUlb();
    forbidOneWayActions();
  });

  afterEach(() => {
    expect(forbidden, 'one-way actions attempted').to.be.empty;
  });

  it('counts each removal of a passed document, shows the countdown, and locks at the cap', function () {
    openAudited().then(({ notes, all }) => {
      cy.writeFile('cypress/tmp/ulb-docs.json', all.map((d) => ({ docId: d.docId, ps: d.processingStatus, used: d.passedReplacementsUsed, name: d.currentUpload?.file?.originalName })))
        .then(() => {
          if (Cypress.env('PROBE') || !notes) this.skip();
        });
    });

    const cycle = (): void => {
      openAudited();
      fetchNotes().then((notes) => {
        Cypress.log({ name: 'notes', message: JSON.stringify({ ps: notes?.processingStatus, used: notes?.passedReplacementsUsed }) });
        // Make sure a passed file is in the slot.
        if (notes.processingStatus !== 'PASSED') {
          uploadNotes();
          return cycle();
        }
        const used: number = notes.passedReplacementsUsed ?? 0;
        cy.log(`Notes to Account: passed, replacements used ${used}/${MAX}`);
        if (used >= MAX) return; // locked: checked by the next test

        // The Remove dialog counts down.
        const left = MAX - used;
        notesRow().find('.doc-action-btn--delete').click();
        cy.contains('.ulb-dialog__title', 'Remove this document?').should('be.visible');
        cy.get('.ulb-dialog__desc').invoke('text').then((text) => {
          if (left <= 1) expect(text).to.include('This is the last time you can remove it');
          else expect(text).to.include(`You can remove a passed document ${left} more times`);
        });
        cy.intercept('DELETE', '**/api/v2/xvi-fc/annual-account/*/documents/*').as('removeDoc');
        cy.contains('.ulb-dialog__actions button', 'Remove and re-upload').click();
        cy.wait('@removeDoc').then(({ request, response }) => {
          expect(response!.statusCode).to.be.oneOf([200, 204]);
          Cypress.env('NOTES_DELETE_URL', request.url); // reused by the server-side cap check
        });

        // The server kept the count (read from the API, not the page's own state).
        fetchNotes().then((after) => {
          expect(after.passedReplacementsUsed ?? 0, 'server count after removal').to.eq(used + 1);
        });
        notesRow().find(UPLOAD_BUTTONS, { timeout: 20000 }).should('exist');
        uploadNotes();
        cycle();
      });
    };
    cycle();
  });

  it('at the cap: no Delete/Re-upload, the lock note names the support email, and the server refuses', function () {
    openAudited().then(({ notes }) => {
      if (!notes || notes.processingStatus !== 'PASSED' || (notes.passedReplacementsUsed ?? 0) < MAX) this.skip();
      notesRow().find('.doc-action-btn--delete').should('not.exist');
      notesRow().find(UPLOAD_BUTTONS).should('not.exist');
      notesRow().find('.attempts-remaining-note').should('contain.text', `already been replaced ${MAX} times and is now`)
        .and('contain.text', 'locked').find(`a[href="mailto:${SUPPORT_EMAIL}"]`).should('exist');

      // The API refuses a removal at the cap, whatever the UI shows.
      const deleteUrl = Cypress.env('NOTES_DELETE_URL');
      expect(deleteUrl, 'remove URL captured in the previous test').to.be.a('string');
      cy.window().then((w) => {
        const t = w.localStorage.getItem('cf_access_token') || w.localStorage.getItem('id_token');
        cy.request({
          method: 'DELETE',
          url: deleteUrl,
          headers: { Authorization: `Bearer ${t}` },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status, 'server refuses removal at the cap').to.eq(409);
          expect(JSON.stringify(res.body)).to.include(LOCK_MESSAGE).and.include(SUPPORT_EMAIL);
        });
      });
      openAudited().then(({ notes: still }) => expect(still.processingStatus, 'document still there').to.eq('PASSED'));
    });
  });
});
