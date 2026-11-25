/**
 * XVI-FC Grant Portal — MoHUA "Claim Eligibility" (TS-1393, part of TS-1256).
 * URL: /fc/xvifc/{yearId}/claims-submission/{stateId}/ulb-eligibility
 * API: GET /api/v2/xvi-fc/mohua/claim-letters/ulb-eligibility/{stateId}/{yearId}/1
 *
 * A live list of every ULB of one State: Eligible or Ineligible, the conditions
 * each ULB fails, and the claim letter (batch) that holds it. MoHUA and PMU see
 * the same read-only page. It is opened from three "Claim eligibility" buttons:
 * the State page, the State's claim letters, and one claim letter.
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (mohua-module/claims-submission/ulb-eligibility) and checked against them.
 *
 * Read-only: every write is blocked and the afterEach fails the test if one is
 * attempted. All expected values come from the live API response, so the spec
 * holds whatever data staging has. "Refresh" is a GET (refresh=true) that only
 * rebuilds the API's 15-minute cache of the condition check.
 */
import { blockWrites, loginAsMohua, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const HEX = '[a-f0-9]{24}';
const PAGE_SIZE = 10;
const ELIGIBILITY_API = new RegExp(`/mohua/claim-letters/ulb-eligibility/${HEX}/${HEX}/1(\\?|$)`);
const RETURNED_STATUSES = [6, 16];

let blockedWrites: string[] = [];

beforeEach(() => {
  loginAsMohua();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

/** The first State that has claimed (it has batches to check), else the first State. */
function pickState() {
  cy.intercept('GET', new RegExp(`/mohua/claim-letters/${HEX}/1$`)).as('claimStates');
  visitWorkspacePage('claims-submission');
  cy.wait('@claimStates').its('response.body.data.states').then((states: any[]) => {
    cy.wrap(states.find((s) => s.firstClaimStatus === 'RECEIVED') ?? states[0]).as('state');
  });
}

/** Opens the page for the picked State, with an optional query string, and keeps the first response. */
function openEligibility(query = '') {
  pickState();
  cy.get('@state').then((s: any) => {
    cy.intercept('GET', ELIGIBILITY_API).as('eligibility');
    visitWorkspacePage(`claims-submission/${s.stateId}/ulb-eligibility${query}`);
  });
  cy.wait('@eligibility').its('response.body.data').as('data');
  cy.contains('h1.cs-title', 'Claim Eligibility').should('be.visible');
}

/** Mirrors the `summary` computed in ulb-eligibility.component.ts. */
function expectedLead(c: any): string {
  const isAre = (n: number) => (n === 1 ? 'is' : 'are');
  if (!c.ineligible) return `All ${c.total} ULBs are eligible.`;
  if (!c.eligible) return `None of the ${c.total} ULBs is eligible yet.`;
  return `${c.eligible} of ${c.total} ULBs ${isAre(c.eligible)} eligible; ${c.ineligible} ${isAre(c.ineligible)} ineligible.`;
}

describe('XVI-FC Grant | MoHUA — Claim Eligibility: counts and summary', () => {
  beforeEach(() => openEligibility());

  it('shows the heading, installment and "As on" time', () => {
    cy.get('@data').then((d: any) => {
      cy.get('h1.cs-title .cs-year').should('contain.text', d.designYearLabel).and('contain.text', 'installment');
      cy.get('.ue-asof').invoke('text').should('match', /^As on \d{1,2} \w{3}, \d{1,2}:\d{2} [AP]M$/);
      cy.get('.ue-pill').first().should('contain.text', `State: ${d.stateName}`);
    });
  });

  it('API counts add up (eligible + ineligible = total; batches = ULBs in letters)', () => {
    cy.get('@data').then((d: any) => {
      const c = d.counts;
      expect(c.eligible + c.ineligible, 'eligible + ineligible').to.eq(c.total);
      expect(c.inLetter + c.notInLetter, 'in a letter + not in a letter').to.eq(c.total);
      const inBatches = c.batches.reduce((sum: number, b: any) => sum + b.count, 0);
      expect(inBatches, 'sum of batch counts').to.eq(c.inLetter);
      const byStatus = c.letterStatuses.reduce((sum: number, s: any) => sum + s.count, 0);
      expect(byStatus, 'sum of letter-status counts').to.eq(c.inLetter);
      expect(c.eligibleNotInLetter, 'eligible not in a letter').to.be.within(0, c.eligible);
      expect(d.pagination.total, 'unfiltered rows').to.eq(c.total);
    });
  });

  it('shows the counts on the All / Eligible / Ineligible toggle', () => {
    cy.get('@data').then((d: any) => {
      cy.get('mat-button-toggle[value="ALL"] .ue-count').should('have.text', String(d.counts.total));
      cy.get('mat-button-toggle[value="ELIGIBLE"] .ue-count').should('have.text', String(d.counts.eligible));
      cy.get('mat-button-toggle[value="INELIGIBLE"] .ue-count').should('have.text', String(d.counts.ineligible));
    });
  });

  it('writes the summary from the counts', () => {
    cy.get('@data').then((d: any) => {
      const c = d.counts;
      cy.get('.ue-summary__lead').should('have.text', expectedLead(c));
      cy.get('.ue-summary__list li').first().invoke('text').then((text) => {
        if (!c.inLetter) expect(text.trim()).to.eq('No ULB is in a claim letter yet.');
        else expect(text).to.include(`${c.inLetter} ULB`).and.include('in claim letters');
      });
      if (c.eligible) {
        cy.get('.ue-summary__list li').eq(1).invoke('text').should(
          c.eligibleNotInLetter ? 'include' : 'eq',
          c.eligibleNotInLetter ? `${c.eligibleNotInLetter} eligible ULB` : 'Every eligible ULB is in a claim letter.',
        );
      }
    });
  });

  it('warns when State-level conditions are not met', () => {
    cy.get('@data').then((d: any) => {
      if (d.stateGate.passed) {
        cy.contains('State conditions not met').should('not.exist');
        return;
      }
      cy.contains('.alert-warning', 'State conditions not met').should('be.visible')
        .and('contain.text', 'No ULB of this State can be claimed until they are.');
      d.stateGate.failedConditions.forEach((f: any) => cy.contains('.alert-warning strong', f.label).should('exist'));
    });
  });
});

describe('XVI-FC Grant | MoHUA — Claim Eligibility: table', () => {
  beforeEach(() => openEligibility());

  it('shows one row per ULB on the page, with the condition columns', () => {
    cy.get('@data').then((d: any) => {
      cy.get('table.ue-table tbody tr').should('have.length', Math.max(d.items.length, 1));
      ['S.No', 'ULB', 'Code', 'Eligibility', 'Batch', 'Tied grant', 'Untied grant']
        .forEach((h) => cy.contains('table.ue-table thead th', h).should('exist'));
      d.columns.forEach((col: any) => cy.contains('table.ue-table thead th', col.header).should('exist'));
      expect(d.items.length, 'page size').to.be.at.most(PAGE_SIZE);
    });
  });

  it('marks each ULB Eligible or Ineligible, and highlights the failed conditions', () => {
    cy.get('@data').then((d: any) => {
      d.items.forEach((row: any, i: number) => {
        cy.get('table.ue-table tbody tr').eq(i).within(() => {
          cy.get('.ue-name').should('contain.text', row.name);
          cy.get('.cs-badge').should('contain.text', row.eligible ? 'Eligible' : 'Ineligible')
            .and('have.class', row.eligible ? 'cs-badge--good' : 'cs-badge--bad');
          if (row.eligible) {
            expect(row.failedConditions, `${row.name} failed conditions`).to.be.empty;
          } else {
            expect(row.failedConditions, `${row.name} failed conditions`).not.to.be.empty;
          }
          const failedColumns = d.columns.filter((col: any) => row.failedConditions.includes(col.key)).length;
          cy.get('td.ue-cell--failed').should('have.length', failedColumns);
        });
      });
    });
  });

  it('shows the batch that holds each ULB (draft batches are not links)', () => {
    cy.get('@data').then((d: any) => {
      d.items.forEach((row: any, i: number) => {
        cy.get('table.ue-table tbody tr').eq(i).find('td.ue-batch-cell').within(() => {
          if (!row.batch) {
            cy.contains('Not in a letter').should('exist');
            return;
          }
          if (row.batch.linkable) cy.contains('a', `Batch ${row.batch.batchNumber}`).should('exist');
          else cy.contains('span', `Batch ${row.batch.batchNumber}`).should('exist');
          // An ineligible ULB still in a letter gets a warning icon.
          cy.get('.ue-warn').should(row.eligible ? 'not.exist' : 'exist');
        });
      });
    });
  });

  it('shows the total row with the ULB count', () => {
    cy.get('@data').then((d: any) => {
      if (!d.pagination.total) return;
      cy.get('tfoot tr.ue-total th').should('contain.text', `Total (${d.pagination.total} ULBs)`);
    });
  });
});

describe('XVI-FC Grant | MoHUA — Claim Eligibility: filters', () => {
  beforeEach(() => openEligibility());

  ['ELIGIBLE', 'INELIGIBLE'].forEach((value) => {
    it(`the ${value.toLowerCase()} filter returns exactly the ${value.toLowerCase()} count`, () => {
      cy.get('@data').then((d: any) => {
        const expected = value === 'ELIGIBLE' ? d.counts.eligible : d.counts.ineligible;
        cy.get(`mat-button-toggle[value="${value}"] button`).click();
        cy.location('search').should('include', `eligibility=${value}`);
        cy.wait('@eligibility').then(({ request, response }) => {
          expect(request.url).to.include(`eligibility=${value}`);
          const body = response!.body.data;
          expect(body.pagination.total, `${value} rows`).to.eq(expected);
          body.items.forEach((row: any) => expect(row.eligible, row.name).to.eq(value === 'ELIGIBLE'));
          // The summary and toggle counts are State-wide and do not change with filters.
          expect(body.counts.total).to.eq(d.counts.total);
        });
        if (!expected) cy.contains('No ULB matches these filters.').should('be.visible');
      });
    });
  });

  it('the "Not in a letter" batch filter returns the not-in-letter count', () => {
    cy.get('@data').then((d: any) => {
      cy.contains('button.ue-pill', 'Batch:').click();
      cy.contains('.ue-menu-item', 'Not in a letter').should('contain.text', String(d.counts.notInLetter)).click();
      cy.location('search').should('include', 'batch=NONE');
      cy.wait('@eligibility').its('response.body.data').then((body: any) => {
        expect(body.pagination.total).to.eq(d.counts.notInLetter);
        body.items.forEach((row: any) => expect(row.batch, row.name).to.be.null);
      });
      cy.contains('button.ue-pill', 'Batch:').should('contain.text', 'Not in a letter');
    });
  });

  it('each batch filter returns that batch\'s ULBs', function () {
    cy.get('@data').then((d: any) => {
      const batch = d.counts.batches[0];
      if (!batch) this.skip();
      cy.contains('button.ue-pill', 'Batch:').click();
      cy.contains('.ue-menu-item', `Batch ${batch.batchNumber}`).click();
      cy.location('search').should('include', `batch=${batch.batchNumber}`);
      cy.wait('@eligibility').its('response.body.data').then((body: any) => {
        expect(body.pagination.total).to.eq(batch.count);
        body.items.forEach((row: any) => expect(row.batch?.batchNumber, row.name).to.eq(batch.batchNumber));
      });
    });
  });

  it('the failed-condition filter returns only ULBs failing that condition', function () {
    cy.get('@data').then((d: any) => {
      const condition = d.conditions[0];
      if (!condition) this.skip();
      cy.contains('button.ue-pill', 'Failed condition:').click();
      cy.contains('.ue-menu-item', condition.label).click();
      cy.wait('@eligibility').its('response.body.data').then((body: any) => {
        body.items.forEach((row: any) => expect(row.failedConditions, row.name).to.include(condition.key));
        expect(body.pagination.total).to.be.at.most(d.counts.ineligible);
      });
    });
  });

  it('searches by ULB name, and says when nothing matches', () => {
    cy.get('@data').then((d: any) => {
      const name: string = d.items[0].name;
      cy.get('input[aria-label="Search ULBs"]').type(name);
      cy.wait('@eligibility').then(({ request, response }) => {
        expect(decodeURIComponent(request.url.replace(/\+/g, ' '))).to.include(`search=${name}`);
        expect(response!.body.data.items.map((r: any) => r.name)).to.include(name);
      });
      cy.contains('table.ue-table tbody tr', name).should('be.visible');
      cy.get('input[aria-label="Search ULBs"]').clear().type('zzz-no-such-ulb');
      cy.contains("No ULB matches 'zzz-no-such-ulb'.").should('be.visible');
    });
  });

  it('Reset clears every filter', () => {
    cy.get('mat-button-toggle[value="INELIGIBLE"] button').click();
    cy.wait('@eligibility');
    cy.contains('button.ue-reset', 'Reset').click();
    cy.location('search').should('not.include', 'eligibility=');
    cy.contains('button.ue-reset', 'Reset').should('not.exist');
  });

  it('pages through the ULBs 10 at a time', function () {
    cy.get('@data').then((d: any) => {
      if (d.pagination.totalPages < 2) this.skip();
      cy.get('nav[aria-label="ULB pages"]').should('contain.text', `Page 1 of ${d.pagination.totalPages}`);
      cy.get('nav[aria-label="ULB pages"]').contains('button', 'Previous').should('be.disabled');
      cy.get('nav[aria-label="ULB pages"]').contains('button', 'Next').click();
      cy.location('search').should('include', 'page=2');
      cy.wait('@eligibility').its('response.body.data').then((body: any) => {
        expect(body.pagination.page).to.eq(2);
        expect(body.items[0].slNo, 'first S.No on page 2').to.eq(PAGE_SIZE + 1);
      });
      cy.get('nav[aria-label="ULB pages"]').should('contain.text', 'Page 2 of');
    });
  });

  it('Refresh re-checks the conditions now (refresh=true)', () => {
    cy.get('@data').then((d: any) => {
      cy.contains('button', 'Refresh').click();
      cy.wait('@eligibility').then(({ request, response }) => {
        expect(request.url).to.include('refresh=true');
        const body = response!.body.data;
        expect(new Date(body.asOn).getTime(), 'asOn after refresh').to.be.at.least(new Date(d.asOn).getTime());
        expect(body.counts.eligible + body.counts.ineligible).to.eq(body.counts.total);
      });
    });
  });
});

describe('XVI-FC Grant | MoHUA — Claim Eligibility: links and deep links', () => {
  it('opens pre-filtered from the URL, and drops filters the API would reject', () => {
    openEligibility('?eligibility=INELIGIBLE&batch=99&letterStatus=42');
    cy.get('@eligibility.all').then((calls: any) => {
      const url: string = calls[0].request.url;
      expect(url).to.include('eligibility=INELIGIBLE');
      expect(url, 'invalid batch dropped').not.to.include('batch=');
      expect(url, 'invalid letter status dropped').not.to.include('letterStatus=');
    });
    cy.get('@data').then((d: any) => {
      d.items.forEach((row: any) => expect(row.eligible, row.name).to.be.false);
    });
  });

  it('a ULB name opens that ULB\'s forms with a way back to Claim Eligibility', () => {
    openEligibility();
    cy.get('@data').then((d: any) => {
      cy.contains('a.ue-link', d.items[0].name).click();
      cy.location('pathname').should('match', new RegExp(`/review-state-submissions/${HEX}/ulb/${d.items[0].ulbId}$`));
      cy.contains('Claim Eligibility').should('exist');
    });
  });

  it('a batch link opens that claim letter with "Back to Claim Eligibility"', function () {
    openEligibility();
    cy.get('@data').then((d: any) => {
      const row = d.items.find((r: any) => r.batch?.linkable);
      if (!row) this.skip();
      cy.get('table.ue-table tbody tr').contains('td.ue-batch-cell a', `Batch ${row.batch.batchNumber}`).first().click();
      cy.location('pathname').should('match', new RegExp(`/claims-submission/${HEX}/letter/${HEX}$`));
      cy.contains('Back to Claim Eligibility').click();
      cy.location('pathname').should('match', /\/ulb-eligibility$/);
    });
  });
});

describe('XVI-FC Grant | MoHUA — Claim Eligibility: entry points', () => {
  beforeEach(() => pickState());

  it('from the State page (Overview → View State → Claim Letters)', () => {
    cy.get('@state').then((s: any) => {
      visitWorkspacePage(`review-state-submissions/${s.stateId}`);
      cy.get('[data-cy="state-detail-eligibility-link"]').scrollIntoView().should('contain.text', 'Claim eligibility').click();
      cy.location('pathname').should('match', new RegExp(`/claims-submission/${s.stateId}/ulb-eligibility$`));
      cy.contains('h1.cs-title', 'Claim Eligibility').should('be.visible');
      // Opened from inside the app, so Back returns to the State page.
      cy.contains('button.cs-back', 'Back').click();
      cy.location('pathname').should('match', new RegExp(`/review-state-submissions/${s.stateId}$`));
    });
  });

  it("from the State's claim letters", () => {
    cy.get('@state').then((s: any) => {
      visitWorkspacePage(`claims-submission/${s.stateId}`);
      cy.get('[data-cy="state-claim-letters-eligibility-link"]').should('contain.text', 'Claim eligibility').click();
      cy.location('pathname').should('match', new RegExp(`/claims-submission/${s.stateId}/ulb-eligibility$`));
      cy.contains('h1.cs-title', 'Claim Eligibility').should('be.visible');
    });
  });

  it('from a claim letter, filtered to its batch (unless the letter was returned)', function () {
    cy.get('@state').then((s: any) => {
      if (s.firstClaimStatus !== 'RECEIVED') this.skip();
      cy.intercept('GET', new RegExp(`/mohua/claim-letters/letter/${HEX}$`)).as('letter');
      visitWorkspacePage(`claims-submission/${s.stateId}`);
      // Letters are cards, each with a "View claim letter <number>" link.
      cy.get('[aria-label^="View claim letter "]').first().click();
      cy.wait('@letter').its('response.body.data').then((l: any) => {
        cy.get('[data-cy="claim-letter-eligibility-link"]').click();
        cy.location('pathname').should('match', /\/ulb-eligibility$/);
        if (RETURNED_STATUSES.includes(l.status)) cy.location('search').should('not.include', 'batch=');
        else cy.location('search').should('include', `batch=${l.batchNumber}`);
      });
      cy.contains('h1.cs-title', 'Claim Eligibility').should('be.visible');
    });
  });
});
