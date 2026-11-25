/**
 * XVI-FC Grant Portal — ADC user's dashboard (TS-1085, TS-1352).
 * URL: /fc/xvifc/{yearId}/overview (role STATE_ADC, signs in through the STATE card)
 *
 * The ADC user gets its own route set (adc-module.routes.ts): overview, ULB Forms
 * Review (ulb-submissions), Create New ULB (register-ulb), ULB list, its team page
 * (roles-teams-unified-view), support and FAQ. Any other path redirects to the
 * overview, and the API enforces the same.
 *
 * Needs ADC_USER_ID / ADC_PASSWORD in .env; skips itself without them.
 * Read-only: every write is blocked and the afterEach fails the test if one is attempted.
 */
import { blockWrites, loginAsAdc, visitWorkspacePage } from '../../support/xvifcSession';

export {};

/** State pages an ADC user must never reach, even from a direct link. */
const STATE_ONLY_PAGES = [
  'claim-letter', 'requirements', 'sfc-status', 'elected-body-status', 'ulb-wise-allocation',
  'gtc', 'fc-unspent-declaration', 'state-dashboard', 'insights',
];
/** Menu words that belong to State-only sections. */
const STATE_ONLY_MENU = /Claim Letter|SFC|Elected Bod|Devolution|ULB-wise Allocation|Grant Transfer|GTC|FC Unspent|Requirements/i;

let blockedWrites: string[] = [];

describe('XVI-FC Grant | ADC user dashboard (TS-1085)', () => {
  before(function () {
    if (!Cypress.env('ADC_USER_ID') || !Cypress.env('ADC_PASSWORD')) this.skip();
  });

  beforeEach(() => {
    loginAsAdc();
    blockedWrites = blockWrites();
  });

  afterEach(() => {
    expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
  });

  it('opens the ADC overview', () => {
    cy.intercept('GET', '**/api/v2/xvi-fc/sidebar/**').as('sidebar');
    visitWorkspacePage('overview');
    cy.location('pathname').should('match', /\/xvifc\/[a-f0-9]{24}\/overview$/);
    cy.wait('@sidebar').then(({ request, response }) => {
      expect(request.url, 'sidebar asked for the ADC role').to.match(/sidebar\/STATE_ADC/);
      cy.writeFile('cypress/tmp/adc-sidebar.json', response!.body);
    });
    cy.screenshot('adc-overview', { capture: 'fullPage' });
  });

  it('the left menu has ULB Forms Review and Create New ULB, and no State-only section', () => {
    visitWorkspacePage('overview');
    // The left menu: the smallest block that holds both its first item (Overview) and its last (FAQs).
    cy.contains('a, li, span', /^\s*ULB Submissions\s*$/).then(($item) => {
      const menuEl = [...$item.parents()].find((p) => /Overview/.test(p.textContent ?? '') && /FAQs/.test(p.textContent ?? ''));
      return cy.wrap(menuEl?.textContent ?? '');
    }).then((menu: string) => {
      expect(menu, 'ULB Forms Review').to.match(/ULB (Forms )?Review|ULB Submissions/i);
      expect(menu, 'Create New ULB').to.match(/Create New ULB|Register ULB|ULB Registration/i);
      expect(menu, 'State-only sections').not.to.match(STATE_ONLY_MENU);
    });
  });

  STATE_ONLY_PAGES.forEach((page) => {
    it(`a direct link to the State page "${page}" sends the ADC user back to the overview`, () => {
      visitWorkspacePage(page);
      cy.location('pathname', { timeout: 20000 }).should('match', /\/overview$/);
    });
  });

  it('opens ULB Forms Review, Create New ULB and its own team page', () => {
    [['ulb-submissions', /ulb-submissions$/], ['register-ulb', /register-ulb$/], ['roles-teams-unified-view', /roles-teams-unified-view$/]]
      .forEach(([page, path]) => {
        visitWorkspacePage(page as string);
        cy.location('pathname', { timeout: 20000 }).should('match', path as RegExp);
      });
  });

  it('the Portal Admin ADC APIs refuse an ADC user (403)', () => {
    visitWorkspacePage('overview');
    cy.window().then((w) => {
      const t = w.localStorage.getItem('cf_access_token') || w.localStorage.getItem('id_token');
      cy.request({ url: '/api/v2/master/adc/manage', headers: { Authorization: `Bearer ${t}` }, failOnStatusCode: false })
        .its('status').should('eq', 403);
    });
  });
});
