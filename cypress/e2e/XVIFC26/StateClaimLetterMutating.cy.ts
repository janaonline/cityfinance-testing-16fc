/**
 * XVI-FC Grant Portal — STATE claim letter: create, fill, sign and SUBMIT (TS-1256).
 *
 * !!! MUTATING: performs real, one-way writes on staging with the STATE account in
 * .env. A submitted letter goes to MoHUA review and cannot be withdrawn by the
 * State. Excluded from default runs (*Mutating.cy.ts); run only with --spec.
 *
 * Steps are separate tests and each picks up whatever already exists:
 *   1. Create a draft with ULB_COUNT eligible ULBs. Only with --env CREATE_LETTER=1
 *      (steps 1-4 end in a real submission; without the flag no letter is started).
 *   2. Fill every box in "Letter details & Preview" (autosaved).
 *   3. Upload the signed claim letter PDF.
 *   4. Submit to MoHUA.
 *   5. Parallel letters: while a letter is under review a second draft can be
 *      created and its picker locks the held ULBs ("In Batch #N"); then discarded.
 *   6. A second draft's annexures leave out the ULBs held by the letter under
 *      review, and rows J/K match the annexure sizes; then discarded.
 *   7. MoHUA marks one ULB for return and returns a letter. Only with
 *      --env RETURN_LETTER=<claimLetterId>,RETURN_STATE=<stateId>.
 *
 * Run only some steps with --env STEPS=5,6. The config excludes *Mutating specs,
 * so also pass --config "excludeSpecPattern=**\/__none__".
 */
import { loginAsMohua, loginAsState, visitStatePage, visitWorkspacePage } from '../../support/xvifcSession';

export {};

const API = '**/api/v2/xvi-fc/state/claim-letter';
const ULB_COUNT = 3;
const SIGNED_PDF = 'cypress/fixtures/valid-test-file.pdf';
const DRAFT_STATUS_LABELS = /In Progress|Draft/i;

// Each describe logs in as the role it needs.

/** --env STEPS=6,7 runs only those steps; without it every step runs. */
function runs(step: number): boolean {
  const steps = Cypress.env('STEPS');
  return steps === undefined || String(steps).split(',').map(Number).includes(step);
}

/** Latest history row that is still a draft (not submitted/abandoned), or null. */
function findDraft(): Cypress.Chainable<any> {
  cy.intercept('GET', `${API}/*/*/history*`).as('history');
  visitStatePage('claim-letter');
  return cy.wait('@history').its('response.body.data').then((rows: any[]) =>
    rows.find((r) => !r.isAbandoned && !r.submittedAt && DRAFT_STATUS_LABELS.test(r.currentFormStatusLabel)) ?? null,
  );
}

function openDraft(): Cypress.Chainable<any> {
  return findDraft().then((draft) => {
    expect(draft, 'an open draft').to.exist;
    cy.intercept('GET', `${API}/${draft.claimLetterId}`).as('detail');
    visitStatePage(`claim-letter/${draft.claimLetterId}`);
    return cy.wait('@detail').its('response.body.data');
  });
}

describe('STATE claim letter — create and submit (MUTATING)', () => {
  beforeEach(() => loginAsState());
  it('1. creates a draft with eligible ULBs', function () {
    if (!runs(1)) this.skip();
    findDraft().then((existing) => {
      if (existing) {
        cy.log(`Draft already exists: batch ${existing.batchNumber}`);
        return;
      }
      // Guard: steps 1-4 end in a real submission. Only start a new letter when asked to,
      // so re-running the spec for later steps never submits another letter by accident.
      if (!Cypress.env('CREATE_LETTER')) {
        cy.log('No draft and CREATE_LETTER not set: not creating a new letter');
        return;
      }
      cy.get('[data-cy="claim-letter-new-button"]').should('be.enabled').click();
      cy.location('pathname').should('match', /\/claim-letter\/new$/);
      cy.intercept('GET', `${API}/*/*/1/ulb-options*`).as('ulbOptions');
      cy.get('[data-cy="claim-ulb-table-add"]').click();
      cy.wait('@ulbOptions');
      cy.get('[data-cy="claim-letter-ulb-picker-eligibility-filter"]').contains('button', /^\s*Eligible\s*$/).click();
      for (let i = 0; i < ULB_COUNT; i++) {
        cy.get('[data-cy="claim-letter-ulb-picker-checkbox"]:not(:disabled)').eq(i).click();
      }
      cy.get('[data-cy="claim-letter-ulb-picker-selected-count"]').should('contain.text', `${ULB_COUNT} ULBs selected`);
      cy.get('[data-cy="claim-letter-ulb-picker-confirm"]').click();
      cy.intercept('POST', `${API}/**`).as('create');
      cy.get('[data-cy="claim-letter-detail-create"]').should('be.enabled').click();
      // A confirmation dialog may follow.
      cy.get('body').then(($b) => {
        const confirm = $b.find('mat-dialog-container button:contains("Create"), mat-dialog-container button:contains("Confirm")');
        if (confirm.length) cy.wrap(confirm.last()).click();
      });
      cy.wait('@create').its('response.statusCode').should('be.oneOf', [200, 201]);
      cy.location('pathname', { timeout: 20000 }).should('match', /\/claim-letter\/[a-f0-9]{24}$/);
    });
  });

  it('2. fills every box in "Letter details & Preview"', function () {
    if (!runs(2)) this.skip();
    findDraft().then((d) => { if (!d) this.skip(); });
    openDraft().then((detail) => {
      if (detail.letterDetailsComplete) {
        cy.log('Letter details already complete');
        return;
      }
      cy.contains('button', /Letter details/i).click();
      cy.get('[data-cy="claim-letter-required-count"]', { timeout: 30000 }).should('be.visible');
      Object.entries(LETTER_TEXT).forEach(([key, value]) => {
        cy.get(`[data-cy="claim-letter-field-${key}"] .cl-control`).clear().type(value).blur();
      });
      Object.entries(LETTER_DATES).forEach(([key, value]) => {
        cy.get(`[data-cy="claim-letter-field-${key}"] input.cl-control`).clear().type(value).blur();
      });
      cy.get('[data-cy="claim-letter-field-gtcTransferredInTime"] select').select('Yes');
      cy.get('[data-cy="claim-letter-field-gtcTransferredInTime"] select').blur();
      cy.get('[data-cy="claim-letter-required-count"]').invoke('text')
        .should('match', /Required: (\d+) of \1 filled/);
      cy.get('[data-cy="claim-letter-save-status"]', { timeout: 20000 }).should('not.contain.text', 'Saving');
      cy.get('[data-cy="claim-letter-save-error"]').should('not.exist');
      cy.get('[data-cy="claim-letter-dialog-close"]').click();
    });
    openDraft().its('letterDetailsComplete').should('eq', true);
  });

  it('3. uploads the signed claim letter', function () {
    if (!runs(3)) this.skip();
    findDraft().then((d) => { if (!d) this.skip(); });
    openDraft().then((detail) => {
      if (detail.hasSignedFile) {
        cy.log('Signed file already uploaded');
        return;
      }
      cy.intercept('POST', `${API}/*/signed-file`).as('signed');
      cy.get('input[type="file"]').selectFile(SIGNED_PDF, { force: true });
      cy.wait('@signed', { timeout: 60000 }).its('response.statusCode').should('be.oneOf', [200, 201]);
      cy.contains('Signed claim letter uploaded.').should('be.visible');
    });
    openDraft().its('hasSignedFile').should('eq', true);
  });

  it('4. submits the letter to MoHUA', function () {
    if (!runs(4)) this.skip();
    findDraft().then((d) => { if (!d) this.skip(); });
    openDraft().then((detail) => {
      expect(detail.letterDetailsComplete, 'letter details complete').to.eq(true);
      expect(detail.hasSignedFile, 'signed file').to.eq(true);
      cy.get('[data-cy="claim-letter-final-name"]', { timeout: 90000 }).should('exist').scrollIntoView();
      cy.get('[data-cy="claim-letter-final-required-alert"]').should('not.exist');
      cy.intercept('POST', `${API}/*/submit`).as('submit');
      cy.get('[data-cy="claim-letter-detail-submit"]', { timeout: 30000 }).should('be.enabled').click();
      cy.contains('Submit to MoHUA?').should('be.visible');
      cy.contains('button', 'Yes, submit').click();
      cy.wait('@submit', { timeout: 90000 }).then(({ response }) => {
        expect(response!.statusCode).to.be.oneOf([200, 201]);
        expect(response!.body.data.submittedAt, 'submittedAt').to.be.a('string');
      });
    });
    // The letter now shows in history as under MoHUA review.
    cy.intercept('GET', `${API}/*/*/history*`).as('history2');
    visitStatePage('claim-letter');
    cy.wait('@history2').its('response.body.data').then((rows: any[]) => {
      const submitted = rows.find((r) => r.submittedAt && !r.isAbandoned);
      expect(submitted, 'submitted letter in history').to.exist;
      cy.contains('[data-cy="claim-letter-row"]', 'Under Review by MoHUA').should('be.visible');
    });
  });

  it('5. parallel letters: a second draft can start while letter 1 is under review, then is discarded', function () {
    if (!runs(5)) this.skip();
    cy.intercept('GET', `${API}/*/*/1/eligibility-summary`).as('summary');
    cy.intercept('GET', `${API}/*/*/history*`).as('history');
    visitStatePage('claim-letter');
    cy.wait('@summary');
    cy.wait('@history').its('response.body.data').then((rows: any[]) => {
      const underReview = rows.find((r) => r.submittedAt && !r.isAbandoned);
      expect(underReview, 'letter under MoHUA review').to.exist;
      // TS-1256: the earlier letter under review does not block a new one.
      cy.get('[data-cy="claim-letter-new-button"]').should('be.enabled').click();
      cy.intercept('GET', `${API}/*/*/1/ulb-options*`).as('ulbOptions');
      cy.get('[data-cy="claim-ulb-table-add"]').click();
      cy.wait('@ulbOptions').its('response.body.data').then((options: any[]) => {
        const held = rows.filter((r) => r.submittedAt && !r.isAbandoned && r.currentFormStatus === 15);
        const heldBatches = held.map((r) => r.batchNumber);
        const claimed = options.filter((o) => o.claimedInBatch);
        expect(claimed.length, 'ULBs held by letters under review')
          .to.eq(held.reduce((n, r) => n + r.ulbCount, 0));
        claimed.forEach((o) => {
          expect(o.eligible, `${o.ulbName} selectable`).to.eq(false);
          expect(heldBatches).to.include(o.claimedInBatch.batchNumber);
        });
        cy.get('[data-cy="claim-letter-ulb-picker-eligibility-filter"]').contains('button', 'In other batches').click();
        cy.get('[data-cy="claim-letter-ulb-picker-row"]').should('have.length', claimed.length).each(($row) => {
          cy.wrap($row).find('[data-cy="claim-letter-ulb-picker-claimed-badge"]').invoke('text').invoke('trim')
            .should('match', /^In Batch #\d+$/);
          cy.wrap($row).find('[data-cy="claim-letter-ulb-picker-checkbox"]').should('be.disabled');
        });
        // Pick one eligible ULB and create draft 2.
        cy.get('[data-cy="claim-letter-ulb-picker-eligibility-filter"]').contains('button', /^\s*Eligible\s*$/).click();
        cy.get('[data-cy="claim-letter-ulb-picker-checkbox"]:not(:disabled)').first().click();
        cy.get('[data-cy="claim-letter-ulb-picker-confirm"]').click();
      });
      cy.intercept('POST', `${API}/**`).as('create2');
      cy.get('[data-cy="claim-letter-detail-create"]').should('be.enabled').click();
      cy.wait('@create2').its('response.statusCode').should('be.oneOf', [200, 201]);
      cy.location('pathname', { timeout: 20000 }).should('match', /\/claim-letter\/[a-f0-9]{24}$/);
      // Discard draft 2 so its slot is freed.
      cy.intercept('POST', `${API}/*/abandon`).as('abandon');
      cy.get('[data-cy="claim-letter-detail-abandon"]').click();
      cy.get('mat-dialog-container').last().find('mat-dialog-actions button').last().click();
      cy.wait('@abandon').its('response.statusCode').should('be.oneOf', [200, 201]);
    });
  });
});

const SNAP = 'cypress/tmp';

function authHeaders(): Cypress.Chainable<Record<string, string>> {
  return cy.window().then((w) => ({
    Authorization: `Bearer ${w.localStorage.getItem('cf_access_token') || w.localStorage.getItem('id_token')}`,
  }));
}

/** The letter document (rows A-K) and every ULB in each annexure list. */
function fetchDocument(claimLetterId: string): Cypress.Chainable<{ doc: any; lists: Record<string, string[]> }> {
  const base = '/api/v2/xvi-fc/state/claim-letter';
  return authHeaders().then((headers) =>
    cy.request({ url: `${base}/${claimLetterId}/document`, headers }).then((res) => {
      const doc = res.body.data;
      const lists: Record<string, string[]> = {};
      doc.annexure.lists.forEach((l: any) => {
        lists[l.key] = [];
        for (let p = 1; p <= Math.max(1, Math.ceil(l.total / 20)); p++) {
          cy.request({ url: `${base}/${claimLetterId}/document/ulbs?list=${l.key}&page=${p}`, headers })
            .then((u) => lists[l.key].push(...u.body.data.map((r: any) => r.cells[1])));
        }
      });
      return cy.wrap(null).then(() => ({ doc, lists }));
    }),
  );
}

/** "5 out of 20 (25%)." → [5, 20] */
function rowCount(doc: any, key: string): [number, number] {
  const row = doc.letter.compliance.find((r: any) => r.key === key);
  const text = row.status[0].runs.map((r: any) => r.text).join('');
  const m = text.match(/(\d+) out of (\d+)/);
  return [Number(m[1]), Number(m[2])];
}

describe('STATE claim letter — Annexure checks while letter 1 is under review (MUTATING)', () => {
  beforeEach(() => loginAsState());
  it('6. a second draft leaves letter 1\'s ULBs out of both annexures (then is discarded)', function () {
    if (!runs(6)) this.skip();
    cy.intercept('GET', `${API}/*/*/history*`).as('history');
    visitStatePage('claim-letter');
    cy.wait('@history').its('response.body.data').then((rows: any[]) => {
      const letter1 = rows.find((r) => r.submittedAt && !r.isAbandoned && r.currentFormStatus === 15);
      expect(letter1, 'letter 1 under MoHUA review').to.exist;
      fetchDocument(letter1.claimLetterId).then(({ lists: l1 }) => {
        const letter1Ulbs = l1.ELIGIBLE;
        cy.get('[data-cy="claim-letter-new-button"]').should('be.enabled').click();
        cy.intercept('GET', `${API}/*/*/1/ulb-options*`).as('ulbOptions');
        cy.get('[data-cy="claim-ulb-table-add"]').click();
        cy.wait('@ulbOptions');
        cy.get('[data-cy="claim-letter-ulb-picker-eligibility-filter"]').contains('button', /^\s*Eligible\s*$/).click();
        cy.get('[data-cy="claim-letter-ulb-picker-checkbox"]:not(:disabled)').first().click();
        cy.get('[data-cy="claim-letter-ulb-picker-confirm"]').click();
        cy.intercept('POST', `${API}/**`).as('create');
        cy.get('[data-cy="claim-letter-detail-create"]').should('be.enabled').click();
        cy.wait('@create').its('response.body.data.claimLetterId').then((draftId: string) => {
          fetchDocument(draftId).then(({ doc, lists }) => {
            cy.writeFile(`${SNAP}/draft2-doc.json`, { doc, lists, letter1Ulbs });
            letter1Ulbs.forEach((name) => {
              expect(lists.ELIGIBLE, `Annexure 1 of draft 2 holds ${name}`).not.to.include(name);
              expect(lists.INELIGIBLE, `Annexure 2 of draft 2 holds ${name}`).not.to.include(name);
            });
            const [j, total] = rowCount(doc, 'J.');
            const [k] = rowCount(doc, 'K.');
            expect(j, 'row J = Annexure 2 size').to.eq(lists.INELIGIBLE.length);
            expect(k, 'row K = Annexure 1 size').to.eq(lists.ELIGIBLE.length);
            cy.log(`Draft 2: J=${j} K=${k} earlier=${letter1Ulbs.length} total=${total}`);
          });
          cy.intercept('POST', `${API}/*/abandon`).as('abandon');
          cy.get('[data-cy="claim-letter-detail-abandon"]').click();
          cy.get('mat-dialog-container').last().find('mat-dialog-actions button').last().click();
          cy.wait('@abandon').its('response.statusCode').should('be.oneOf', [200, 201]);
        });
      });
    });
  });
});

describe('MoHUA returns a letter with one ULB marked (MUTATING)', () => {
  // Runs only with --env RETURN_LETTER=<claimLetterId>,RETURN_STATE=<stateId>.
  it('7. MoHUA marks one ULB for return and returns the letter', function () {
    if (!runs(7)) this.skip();
    const letterId = Cypress.env('RETURN_LETTER');
    const stateId = Cypress.env('RETURN_STATE');
    if (!letterId || !stateId) this.skip();
    loginAsMohua();
    cy.intercept('GET', new RegExp(`/mohua/claim-letters/letter/${letterId}$`)).as('letter');
    cy.intercept('GET', new RegExp(`/mohua/claim-letters/letter/${letterId}/ulbs`)).as('ulbs');
    visitWorkspacePage(`claims-submission/${stateId}/letter/${letterId}`);
    cy.wait('@letter').its('response.body.data').then((l: any) => {
      if (l.status !== 15) {
        cy.log(`Letter is not under review (status ${l.status}); nothing to do`);
        return;
      }
      cy.wait('@ulbs').its('response.body.data.items').then((items: any[]) => {
        const ulb = items.find((i) => !i.exemptions?.length && i.reviewStatus !== 'RETURNED') ?? items[0];
        cy.writeFile(`${SNAP}/returned-ulb.json`, { letterId, ulb: ulb.name, all: items.map((i) => i.name) });
        // Already marked if the row has the red "marked" class or the API says so (field names vary).
        if (!l.returnedUlbCount) {
          cy.intercept('PUT', '**/mohua/claim-letters/letter/*/ulb/*/decision').as('decide');
          cy.contains('tr', ulb.name).find('button.cl-icon-btn--return').click();
          cy.contains(`Return ${ulb.name} for correction?`).should('be.visible');
          cy.contains('label.rcl-option', 'Audited Statements').find('input[type="checkbox"]').check({ force: true });
          cy.get('#rcl-remark').type('QA test return for TS-1256: please re-check the audited statements.');
          cy.contains('button.rcl-confirm', 'Mark for Return').click();
          cy.wait('@decide').its('response.statusCode').should('be.oneOf', [200, 201]);
        }
      });
      cy.intercept('POST', `**/mohua/claim-letters/letter/${letterId}/return`).as('return');
      cy.contains('button', /Return Claim Letter|Return for correction/).should('be.enabled').click();
      cy.get('button.rcl-confirm').should('be.visible');
      cy.get('body').then(($b) => {
        if ($b.find('#rcl-state-remark').length) cy.get('#rcl-state-remark').clear().type('QA test return for TS-1256 (parallel letters).');
      });
      cy.get('button.rcl-confirm').should('be.enabled').click();
      cy.wait('@return').then(({ response }) => {
        expect(response!.statusCode).to.be.oneOf([200, 201]);
        cy.writeFile(`${SNAP}/return-response.json`, response!.body);
      });
    });
  });
});

const LETTER_TEXT: Record<string, string> = {
  departmentName: 'Urban Development Department, Government of Tripura',
  departmentAddress: 'Civil Secretariat, Agartala, Tripura 799010',
  departmentEmail: 'udd.test@example.com',
  letterNo: 'UDD/XVIFC/CL/2026/001',
  gtcPenalInterestDetails: 'Not applicable: the grant was transferred within the stipulated time.',
  officerName: 'Test Officer',
  officerDesignation: 'Director, Urban Development',
};

const LETTER_DATES: Record<string, string> = {
  letterDate: '24/11/2026',
  mohuaReferenceDate: '01/04/2026',
  sfcAtrDate: '01/10/2026',
};
