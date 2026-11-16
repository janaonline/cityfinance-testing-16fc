/**
 * XVI-FC Grant Portal — STATE "Generate Claim Letter".
 * URLs: /fc/xvifc/{yearId}/claim-letter, .../claim-letter/new
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (state-module/claim-letter) and checked against staging.
 *
 * Whether the state can start a claim depends on shared data: the
 * eligibility summary (GET .../claim-letter/{stateId}/{yearId}/1/
 * eligibility-summary) and the batch history. Every assertion is compared
 * against those live responses, so the spec passes whichever state staging
 * is in.
 *
 * Opening claim-letter/new and the ULB picker only issue GETs; nothing is
 * written until "Create Draft". All writes are blocked anyway, and no draft's
 * detail page is opened (opening a draft that has a signed letter can rebuild
 * and store its merged PDF server-side).
 */
import { blockWrites, loginAsState, visitStatePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

let blockedWrites: string[] = [];

function openClaimLetterList() {
  cy.intercept('GET', '**/api/v2/xvi-fc/state/claim-letter/*/*/1/eligibility-summary').as('eligibility');
  cy.intercept('GET', '**/api/v2/xvi-fc/state/claim-letter/*/*/history*').as('history');
  visitStatePage('claim-letter');
  cy.wait('@eligibility').its('response.body.data').as('summary');
  cy.wait('@history').its('response.body').as('historyBody');
}

/** Mirrors canCreateNewClaim() in claim-letter-list.component.ts. */
function canStartClaim(s: any): boolean {
  return Boolean(s.stateLevelGate?.passed) && (s.ulbReadiness?.eligible ?? 0) > 0
    && s.batchSlotsUsed < s.batchSlotsMax && s.activeBatchNumber == null;
}

beforeEach(() => {
  loginAsState();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | STATE — Generate Claim Letter list', () => {
  beforeEach(() => openClaimLetterList());

  it('shows the heading and subtitle', () => {
    cy.contains('h1', 'Generate Claim Letter').should('be.visible');
    cy.contains('Generate a claim letter for the release of Installment 1 by selecting the ULBs.').should('be.visible');
  });

  it('enables New Claim only when the state can start a claim', () => {
    cy.get('@summary').then((s: any) => {
      if (canStartClaim(s)) {
        cy.get('[data-cy="claim-letter-new-button"]').should('be.enabled');
        cy.get('[data-cy="claim-letter-new-disabled-reason"]').should('not.exist');
      } else {
        cy.get('[data-cy="claim-letter-new-button"]').should('be.disabled');
        cy.get('[data-cy="claim-letter-new-disabled-reason"]').should('be.visible').invoke('text')
          .should('match', /eligibility conditions|No ULBs currently meet|claim batch slots|Only one claim batch|currently unavailable/);
      }
    });
  });

  it('shows the eligibility panel figures from the API', () => {
    cy.get('@summary').then((s: any) => {
      const eligible = Boolean(s.stateLevelGate?.passed) && s.ulbReadiness?.eligible > 0;
      cy.get('[data-cy="claim-letter-eligibility-panel"]').within(() => {
        cy.contains('.badge', eligible ? /^\s*Eligible\s*$/ : 'Not Eligible').should('be.visible');
        cy.contains(`Expected ULBs: ${s.expectedUlbCount}`).should('be.visible');
        cy.get('[data-cy="claim-letter-ulb-readiness"]')
          .should('contain.text', `${s.ulbReadiness.eligible}/${s.ulbReadiness.total}`);
        cy.contains(/Batch slots used:/).parent().invoke('text')
          .should('match', new RegExp(`${s.batchSlotsUsed}/\\s*${s.batchSlotsMax}`));
      });
    });
  });

  it('lists every state-level condition in the eligibility checklist', () => {
    cy.get('@summary').then((s: any) => {
      const sources = (s.stateLevelGate?.sources ?? []).filter((src: any) => src.result);
      const anyFailed = sources.some((src: any) => src.result === 'FAILED');
      cy.get('[data-cy="claim-letter-eligibility-checklist"]').should('be.visible');
      if (!anyFailed && sources.length) {
        // All passed: collapsed behind a summary line until expanded.
        cy.contains(`All state eligibility criteria met (${sources.length}/${sources.length})`).should('be.visible');
        cy.get('[data-cy="claim-letter-eligibility-checklist-toggle"]').click();
      }
      cy.get('[data-cy="claim-letter-eligibility-checklist-items"]').should('be.visible');
      cy.get('[data-cy="claim-letter-eligibility-checklist-items"] .bi-x-circle-fill')
        .should('have.length', sources.filter((src: any) => src.result === 'FAILED').length);
    });
  });

  it('shows the four claim summary tiles', () => {
    cy.get('[data-cy="claim-letter-summary-tiles"] .summary-tile').should('have.length', 4);
    ['Balance Available for Claim', 'Total Allocation for 1st Installment',
      'Claims Under Review by MoHUA', 'Claims in Draft'].forEach((label) => {
      cy.get('[data-cy="claim-letter-summary-tiles"]').should('contain.text', label);
    });
  });

  it('switches the amount units', () => {
    cy.get('[data-cy="amount-display-toggle-option-inr"]').click();
    cy.get('[data-cy="claim-letter-summary-tiles"] .summary-tile-value').first().invoke('text').should('match', /₹/);
    cy.get('[data-cy="amount-display-toggle-option-cr"]').click();
    cy.get('[data-cy="claim-letter-summary-tiles"] .summary-tile-value').first().invoke('text').should('match', /Cr/);
    // The choice is remembered in localStorage — put it back for other specs.
    cy.get('[data-cy="amount-display-toggle-reset"]').click({ force: true });
  });

  it('expands and collapses "How this works"', () => {
    cy.get('[data-cy="claim-letter-instructions"]').should('not.exist');
    cy.get('[data-cy="claim-letter-instructions-toggle"]').click();
    cy.get('[data-cy="claim-letter-instructions"]').should('be.visible')
      .and('contain.text', 'Submitting to MoHUA requires the signed claim letter upload first');
    cy.get('[data-cy="claim-letter-instructions-toggle"]').click();
    cy.get('[data-cy="claim-letter-instructions"]').should('not.exist');
  });

  it('shows the claim letter history (or its empty state)', () => {
    cy.contains('Claim Letter History').scrollIntoView().should('be.visible');
    cy.get('@historyBody').then((body: any) => {
      const rows = body.data ?? [];
      if (!rows.length) {
        cy.get('[data-cy="claim-letter-empty-state"]').scrollIntoView().should('be.visible')
          .and('contain.text', "No claim letters yet. Start a new claim once you're eligible.");
        return;
      }
      ['Batch #', 'Version', 'Status', 'ULBs', 'Claimed Total', 'Submitted', 'Action']
        .forEach((h) => cy.contains('th', h).should('exist'));
      cy.get('[data-cy="claim-letter-row"]').should('have.length', Math.min(rows.length, 10));
    });
  });
});

describe('XVI-FC Grant | STATE — New Claim Letter page', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/v2/xvi-fc/state/claim-letter/*/*/1/claim-context').as('context');
    visitStatePage('claim-letter/new');
    cy.wait('@context').its('response.body.data').as('context');
  });

  it('shows the create view with an empty ULB table', () => {
    cy.contains('h1', 'New Claim Letter').should('be.visible');
    cy.get('[data-cy="claim-ulb-table-empty"]').should('contain.text', 'No ULBs added yet.');
    cy.get('[data-cy="claim-letter-detail-create"]').should('exist');
    cy.get('[data-cy="claim-letter-detail-cancel"]').should('be.visible');
  });

  it('will not create a draft with no ULBs selected', () => {
    cy.get('@context').then((ctx: any) => {
      if (!ctx.canCreate) {
        cy.get('[data-cy="claim-letter-detail-create"]').should('be.disabled');
        cy.get('[data-cy="claim-letter-create-blocked"]').should('be.visible');
        return;
      }
      cy.get('[data-cy="claim-letter-detail-create"]').click();
      cy.contains('Please correct the errors before creating the draft.').should('be.visible');
    });
  });

  it('opens the ULB picker and closes it without adding anything', function () {
    cy.get('@context').then((ctx: any) => {
      if (!ctx.canCreate) {
        cy.get('[data-cy="claim-ulb-table-add"]').should('be.disabled');
        return;
      }
      cy.intercept('GET', '**/api/v2/xvi-fc/state/claim-letter/*/*/1/ulb-options*').as('ulbOptions');
      cy.get('[data-cy="claim-ulb-table-add"]').click();
      cy.wait('@ulbOptions');
      cy.contains('Select ULBs').should('be.visible');
      cy.get('#claim-letter-ulb-picker-search').should('be.visible');
      cy.get('[data-cy="claim-letter-ulb-picker-eligibility-filter"]').should('contain.text', 'Eligible')
        .and('contain.text', 'Ineligible');
      cy.get('[data-cy="claim-letter-ulb-picker-confirm"]').should('be.disabled');
      cy.get('button[aria-label="Close dialog"]').click();
      cy.contains('Select ULBs').should('not.exist');
      cy.get('[data-cy="claim-ulb-table-empty"]').should('be.visible');
    });
  });

  it('Cancel with no ULBs returns to the claim letter list', () => {
    cy.get('[data-cy="claim-letter-detail-cancel"]').click();
    cy.location('pathname').should('match', /\/claim-letter$/);
    cy.contains('h1', 'Generate Claim Letter').should('be.visible');
  });
});
