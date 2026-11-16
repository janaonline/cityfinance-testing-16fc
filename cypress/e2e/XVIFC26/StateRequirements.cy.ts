/**
 * XVI-FC Grant Portal — STATE "Requirements" page (and the State Level
 * Conditions sidebar group).
 * URL: /fc/xvifc/{yearId}/requirements
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (state-module/requirements) and checked against staging.
 *
 * The page is read-only. Its rows come from the claim-letter eligibility
 * summary (stateLevelGate.sources) and its allocation figure from the state
 * dashboard API; every assertion is compared against those live responses so
 * the spec holds whatever state each condition is in.
 */
import { blockWrites, loginAsState, visitStatePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

let blockedWrites: string[] = [];

/** Mirrors the button label/tier rules in requirements.component.ts. */
function expectedAction(source: any): { label: string; passed: boolean } {
  if (source.result === 'EXEMPTED') return { label: 'Exempted', passed: true };
  const s = source.statusAtEvaluation;
  let label = 'View';
  let success = false;
  if (s === null) label = 'Start';
  else if (s === 0 || s === 1) label = 'Start';
  else if (s === 2) label = 'Continue';
  else if (s === 5 || s === 13) { label = 'Submitted'; success = true; }
  else if (s === 6 || s === 14) label = 'Resubmit';
  else if (s === 7) { label = 'Acknowledged'; success = true; }
  return { label, passed: source.result === 'PASSED' || success };
}

function openRequirements() {
  cy.intercept('GET', '**/api/v2/xvi-fc/state/*/*/dashboard').as('dashboard');
  cy.intercept('GET', '**/api/v2/xvi-fc/state/claim-letter/*/*/1/eligibility-summary').as('eligibility');
  visitStatePage('requirements');
  cy.wait('@dashboard').its('response.body.data').as('dashboardData');
  cy.wait('@eligibility').its('response.body.data').as('summary');
}

beforeEach(() => {
  loginAsState();
  blockedWrites = blockWrites();
  openRequirements();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | STATE — State Level Conditions sidebar', () => {
  it('lists every State Level Conditions page', () => {
    cy.contains('.menu-header', /State level conditions/i).should('be.visible');
    ['Requirements', 'SFC Status', 'Elected Body Status', 'ULB-wise Allocation',
      'FC Unspent Declaration', 'Grant Transfer Certificate', 'Generate Claim Letter'].forEach((label) => {
      cy.contains('span.menu-label', label).should('be.visible');
    });
  });

  const PAGES: [string, string, RegExp][] = [
    ['SFC Status', 'sfc-status', /State Finance Commission Verification/],
    ['Elected Body Status', 'elected-body-status', /Elected Urban Local Bodies - Status Confirmation/],
    ['ULB-wise Allocation', 'ulb-wise-allocation', /ULB-wise Allocation/],
    ['FC Unspent Declaration', 'fc-unspent-declaration', /Unspent 1[45]th FC Balance Declaration/],
    ['Grant Transfer Certificate', 'gtc', /Grant Transfer Certificate/],
    ['Generate Claim Letter', 'claim-letter', /Generate Claim Letter/],
  ];
  PAGES.forEach(([label, route, heading]) => {
    it(`opens ${label} from the sidebar`, () => {
      cy.contains('span.menu-label', label).click();
      cy.location('pathname').should('match', new RegExp(`/${route}$`));
      cy.contains('h1', heading, { timeout: 20000 }).should('be.visible');
    });
  });
});

describe('XVI-FC Grant | STATE — Requirements page', () => {
  it('shows the financial year heading and the state allocation banner', () => {
    cy.get('@dashboardData').then((d: any) => {
      const fy = d.context.financialYear;
      cy.contains('h1', `FY ${fy} State Requirements`).should('be.visible');
      cy.contains(new RegExp(`Total State Allocation FY ${fy}`, 'i')).should('be.visible');
    });
    cy.get('@summary').then((s: any) => {
      cy.contains(`For ${s.expectedUlbCount} ULBs in ${s.stateName}`).should('be.visible');
    });
  });

  it('shows progress that matches the conditions met', () => {
    cy.get('@summary').then((s: any) => {
      const sources = s.stateLevelGate?.sources ?? [];
      const passed = sources.filter((src: any) => expectedAction(src).passed).length;
      const pct = sources.length ? Math.round((passed / sources.length) * 100) : 0;
      cy.contains(`${passed} of ${sources.length} requirements submitted`).should('be.visible');
      cy.get('.progress[role="progressbar"]').should('have.attr', 'aria-valuenow', String(pct));
      cy.get('.progress-bar').should('contain.text', `${pct}%`);
    });
  });

  it('lists each 1st-installment condition with the right action', () => {
    cy.contains(/Conditions to be met for 1st Installment/i).should('be.visible');
    cy.get('@summary').then((s: any) => {
      const sources = s.stateLevelGate?.sources ?? [];
      cy.get('.condition-action-btn').should('have.length', sources.length);
      sources.forEach((src: any, i: number) => {
        if (src.displayLabel) cy.contains(src.displayLabel).should('be.visible');
        cy.get('.condition-action-btn').eq(i).should('contain.text', expectedAction(src).label);
      });
    });
  });

  it("a condition's action button opens its form", () => {
    cy.get('@summary').then((s: any) => {
      const sources = s.stateLevelGate?.sources ?? [];
      const i = sources.findIndex((src: any) => src.checklistRoute);
      if (i < 0) return;
      cy.get('.condition-action-btn').eq(i).click();
      const route = String(sources[i].checklistRoute).split('/').filter(Boolean).pop();
      cy.location('pathname').should('match', new RegExp(`/${route}$`));
    });
  });

  it('switches the amount units', () => {
    cy.get('[data-cy="amount-display-toggle-option-inr"]').click();
    cy.get('section.summary-banner h1').invoke('text').should('match', /₹|—/);
    cy.get('[data-cy="amount-display-toggle-option-lakh"]').click();
    cy.get('[data-cy="amount-display-toggle-option-lakh"]').should('have.attr', 'aria-pressed', 'true');
    // The choice is remembered in localStorage — put it back for other specs.
    cy.get('[data-cy="amount-display-toggle-reset"]').click({ force: true });
  });
});
