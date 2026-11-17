/**
 * XVI-FC Grant Portal — MoHUA view of a State's submissions:
 * state detail, the State's form views (view-only), a ULB's forms, and the
 * FC Unspent Declaration review.
 * URLs: /fc/xvifc/{yearId}/review-state-submissions/{stateId}[/...],
 *       /fc/xvifc/{yearId}/fc-unspent-review[/{stateId}]
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (mohua-module) and checked against staging.
 *
 * Read-only: every write is blocked and the afterEach fails the test if one is
 * attempted. The state under test is the first state that has submitted a claim
 * (from the claim-letters API), so its forms have real data; all expectations
 * come from the live responses.
 *
 * MoHUA has no approve/return controls on the review-state-submissions pages
 * (the API sends the permissions as false) — the spec asserts they stay
 * absent. FC Unspent review is only opened for a state whose declaration is in
 * a reviewable status (15/5/7): any other status returns 403, which the app
 * treats as a logout.
 */
import { blockWrites, loginAsMohua, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const HEX = '[a-f0-9]{24}';
const STAGE_LABEL: Record<string, string> = {
  underReview: 'Under Review by MoHUA', inProgress: 'In Progress', notStarted: 'Not Started',
};
const FORM_ROUTE: Record<string, string> = {
  'SFC Status': 'sfc-status', 'Elected Bodies': 'elected-body', Devolution: 'devolution-formula/1',
  'FC Unspent Disclosure': 'fc-unspent', 'Grant Transfer Certificate': 'gtc/1',
};

let blockedWrites: string[] = [];

beforeEach(() => {
  loginAsMohua();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

/** Picks the first state that has claimed (falls back to the first state). */
function pickState() {
  cy.intercept('GET', new RegExp(`/mohua/claim-letters/${HEX}/1$`)).as('claimStates');
  visitWorkspacePage('claims-submission');
  cy.wait('@claimStates').its('response.body.data.states').then((states: any[]) => {
    cy.wrap(states.find((s) => s.firstClaimStatus === 'RECEIVED') ?? states[0]).as('state');
  });
}

function openStateDetail() {
  pickState();
  cy.get('@state').then((s: any) => {
    cy.intercept('GET', new RegExp(`/mohua/state/${HEX}/${HEX}$`)).as('stateDetail');
    cy.intercept('GET', new RegExp(`/mohua/state/${HEX}/${HEX}/ulbs\\?`)).as('stateUlbs');
    visitWorkspacePage(`review-state-submissions/${s.stateId}`);
    cy.wait('@stateDetail').its('response.body.data').as('detail');
    cy.wait('@stateUlbs').its('response.body.data').as('ulbs');
  });
}

describe('XVI-FC Grant | MoHUA — State detail', () => {
  beforeEach(() => openStateDetail());

  it('shows the state with its stage and allocation', () => {
    cy.get('@detail').then((d: any) => {
      cy.contains('nav.sd-crumb a', 'All States').should('be.visible');
      cy.get('nav.sd-crumb [aria-current="page"]').should('contain.text', d.state.name);
      cy.contains('h1.sd-title', d.state.name).should('be.visible');
      cy.get('.sd-chip').first().invoke('text').should('match', new RegExp(STAGE_LABEL[d.state.stage], 'i'));
      cy.get('p.sd-meta').should('contain.text', `FY ${d.year.label}`);
      ['Annual Allocation', 'Eligible Amount'].forEach((t) => cy.contains('.sd-stat__label', t).should('exist'));
    });
  });

  it("lists the State's five conditions with View links only for viewable forms", () => {
    cy.contains('State Form Completion').should('be.visible');
    cy.get('@detail').then((d: any) => {
      cy.get('.sd-cond__item').should('have.length', d.forms.length);
      d.forms.forEach((f: any) => {
        cy.contains('.sd-cond__item', f.label).within(() => {
          if (f.completed) cy.get('.sd-cond__stamp').should('exist');
          else cy.get('.sd-chip').invoke('text').should('match', new RegExp(f.statusLabel, 'i'));
          cy.get(`a.sd-cond__pdf[aria-label="View ${f.label}"]`).should(f.canView ? 'exist' : 'not.exist');
        });
      });
    });
  });

  it('shows ULB form completion across the state', () => {
    cy.get('@detail').then((d: any) => {
      cy.contains(`Form completion status across the state's ${d.ulbForms.totalUlbs} ULBs.`).should('exist');
      d.ulbForms.items.forEach((item: any) => {
        cy.contains('.sd-ring-card', item.label).find('.sd-ring-card__count')
          .should('contain.text', `${item.completed}/${d.ulbForms.totalUlbs}`);
      });
    });
  });

  it('lists ULBs with search and allocation sorting on the server', () => {
    cy.get('@ulbs').then((u: any) => {
      cy.get('table.sd-table tbody tr').should('have.length', u.items.length);
      if (!u.items.length) return;
      const first = u.items[0];
      cy.get('input[aria-label="Search ULB name or census code"]').type(first.censusCode || first.name);
      cy.wait('@stateUlbs').its('request.url').should('include', 'search=');
      cy.contains('a.sd-ulb-name', first.name).should('be.visible');
      cy.get('input[aria-label="Search ULB name or census code"]').clear().type('zzz-no-such-ulb');
      cy.contains('No ULBs match your search.').should('be.visible');
      cy.get('input[aria-label="Search ULB name or census code"]').clear();
      cy.wait('@stateUlbs');
      cy.contains('table.sd-table th', /allocation/i).click();
      cy.wait('@stateUlbs').its('request.url').should('include', 'sortBy=allocation');
    });
  });

  it('downloads the ULB-wise progress as Excel', function () {
    cy.get('@ulbs').then((u: any) => { if (!u.pagination?.total && !u.items.length) this.skip(); });
    cy.intercept('GET', new RegExp(`/mohua/state/${HEX}/${HEX}/ulbs/export`)).as('export');
    cy.get('button.sd-export').click();
    cy.wait('@export').then(({ response }) => {
      expect(response!.statusCode).to.eq(200);
      expect(String(response!.headers['content-disposition'])).to.match(/ulb-progress.*\.xlsx/);
    });
  });
});

describe("XVI-FC Grant | MoHUA — State's form views (view-only)", () => {
  it('opens each viewable State form read-only, with no review controls', function () {
    openStateDetail();
    cy.get('@detail').then((d: any) => {
      const viewable = d.forms.filter((f: any) => f.canView && FORM_ROUTE[f.label]);
      if (!viewable.length) this.skip();
      viewable.forEach((f: any) => {
        cy.get('@state').then((s: any) => visitWorkspacePage(`review-state-submissions/${s.stateId}/${FORM_ROUTE[f.label]}`));
        cy.get('h1.page-title', { timeout: 20000 }).should('be.visible');
        cy.contains(/Viewing the state's submitted .* form/).should('be.visible');
        cy.get('span.badge.rounded-pill').first().invoke('text').should('not.match', /Unknown/);
        cy.get('app-review-acknowledgment .acknowledgement').should('not.exist');
        cy.get('[data-cy="pmu-form-review-undo"], [data-cy="pmu-row-review-undo"]').should('not.exist');
        cy.get('.breadcrumb').should('contain.text', 'All States').and('contain.text', d.state.name);
      });
    });
  });
});

describe("XVI-FC Grant | MoHUA — A ULB's forms", () => {
  it("opens a ULB from the state and shows each form's status read-only", function () {
    openStateDetail();
    cy.get('@ulbs').then((u: any) => {
      if (!u.items.length) this.skip();
      cy.intercept('GET', new RegExp(`/mohua/ulb/${HEX}/${HEX}/forms$`)).as('ulbForms');
      cy.contains('a.sd-ulb-name', u.items[0].name).click();
      cy.wait('@ulbForms', { timeout: 20000 }).its('response.body.data.forms').then((forms: any) => {
        cy.contains('h1.ud-title', u.items[0].name).should('be.visible');
        cy.get('button.ud-tab[role="tab"]').should('have.length', 5);
        const order = ['audited', 'unaudited', 'pfms', 'slb', 'dur'];
        order.forEach((key, i) => {
          if (forms[key]?.statusLabel) {
            cy.get('button.ud-tab').eq(i).find('.ud-tab__status').should('contain.text', forms[key].statusLabel);
          }
        });
        // Every tab opens without any edit/decision controls.
        cy.get('button.ud-tab').each(($tab) => {
          cy.wrap($tab).click().should('have.attr', 'aria-selected', 'true');
          cy.get('.doc-action-btn, .page-footer button').should('not.exist');
        });
      });
      cy.contains('nav.ud-crumb a', 'All States').should('exist');
    });
  });
});

describe('XVI-FC Grant | MoHUA — FC Unspent Declaration review', () => {
  it('picks a state before reviewing', () => {
    cy.intercept('GET', '**/api/v2/master/state').as('states');
    visitWorkspacePage('fc-unspent-review');
    cy.wait('@states');
    cy.contains('h1', 'FC Unspent Declaration — Select a State').should('be.visible');
    cy.contains('button', 'Review FC Unspent Declaration').should('be.disabled');
    cy.get('#fc-unspent-review-state-select option').should('have.length.greaterThan', 1);
    cy.get('#fc-unspent-review-state-select option:disabled').should('contain.text', 'Select a state to review');
  });

  it("reviews a state's declaration read-only (reviewable states only)", function () {
    openStateDetail();
    cy.get('@detail').then((d: any) => {
      const fcu = d.forms.find((f: any) => f.label === 'FC Unspent Disclosure');
      if (!fcu || ![15, 5, 7].includes(fcu.statusCode)) {
        cy.log(`FC Unspent for ${d.state.name} is not reviewable (status ${fcu?.statusCode}) — opening it would 403 and log out`);
        this.skip();
      }
      cy.intercept({ method: 'GET', url: new RegExp(`/mohua/fc-unspent-declaration/${HEX}/${HEX}$`) }).as('fcu');
      visitWorkspacePage(`fc-unspent-review/${d.state.id}`);
      cy.wait('@fcu').its('response.body.data').then((f: any) => {
        cy.contains('h1', f.stateName).should('be.visible');
        cy.get('span.badge.text-bg-secondary').should('contain.text', f.currentFormStatusLabel);
        cy.contains(`${f.applicableFc === '15TH_FC' ? '15th' : '14th'} FC`).should('exist');
        if (f.isFcUnspent === true) {
          ['Total', 'Active', 'Pending', 'Rejected', 'Eligible', 'Ineligible'].forEach((t) => cy.contains(t).should('exist'));
          cy.get('#fc-unspent-review-search').should('be.visible');
        } else if (f.isFcUnspent === false) {
          cy.contains('Signed Declaration').should('be.visible');
        }
        if (!f.permissions?.canApproveForm) {
          cy.get('[data-cy="fc-unspent-review-approve-form"], [data-cy="fc-unspent-review-reject-form"]').should('not.exist');
        }
      });
    });
  });
});
