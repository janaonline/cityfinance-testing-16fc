/**
 * Shared login / navigation / write-blocking helpers for the XVI-FC specs.
 *
 * The STATE and ULB accounts are shared and staging locks accounts after
 * repeated logins, so specs reuse ONE cached session per account (cy.session
 * with cacheAcrossSpecs) instead of signing in per test. The workspace base
 * path (/fc/xvifc/{id}) is captured at login and kept in localStorage, which
 * cy.session restores along with the auth token.
 */

const IDENTIFIER_INPUT = 'input[formcontrolname="identifier"]';
const PASSWORD_INPUT = 'input[formcontrolname="password"]';
const BASE_KEY = 'cy_xvifc_workspace_base';
const ULB_DETAILS_KEY = 'xvifc_ulb_details';

function login(role: 'STATE' | 'ULB' | 'MOHUA' | 'ADMIN' | 'ADC', identifier: string, password: string) {
  cy.session(
    [role, identifier],
    () => {
      cy.visit('/fc/auth/login/16thFC');
      // The Portal Admin has no card of its own: it signs in through MOHUA and the server returns role ADMIN.
      // An ADC user (STATE_ADC) signs in through the STATE card.
      cy.contains('span.role-card__label', role === 'ADMIN' ? 'MOHUA' : role === 'ADC' ? 'STATE' : role).click();
      cy.get(IDENTIFIER_INPUT).type(identifier, { force: true });
      cy.get(PASSWORD_INPUT).type(password, { force: true, log: false });
      cy.contains('button', 'Sign In').click();

      // Some sessions stop on a "Select Financial Year" gate; clear it if shown.
      cy.contains(/Continue|People and Roles/, { timeout: 30000 })
        .invoke('text')
        .then((text: string) => {
          if (text.includes('Continue')) cy.contains(/Continue|People and Roles/).click();
        });
      cy.location('pathname', { timeout: 30000 }).should('match', /\/xvifc\/[a-f0-9]{24}\//);
      cy.location('pathname').then((path) => {
        const base = path.match(/^(.*\/xvifc\/[a-f0-9]{24})\//)![1];
        cy.window().then((win) => win.localStorage.setItem(BASE_KEY, base));
        if (role === 'ULB') {
          // ULB pages (Conditions, uploads, PFMS, DUR) read the ULB name/state/year
          // from localStorage, which only the Overview page writes — and login
          // doesn't always land there. Load it before the session is cached.
          cy.visit(`${base}/overview`);
          cy.window({ timeout: 30000 }).its('localStorage').invoke('getItem', ULB_DETAILS_KEY).should('be.a', 'string');
        }
      });
    },
    {
      cacheAcrossSpecs: true,
      validate() {
        cy.window().then((win) => {
          expect(win.localStorage.getItem(BASE_KEY), 'workspace base').to.match(/\/xvifc\/[a-f0-9]{24}$/);
          expect(win.localStorage.getItem('id_token') || win.localStorage.getItem('cf_access_token'), 'auth token')
            .to.be.a('string');
          if (role === 'ULB') expect(win.localStorage.getItem(ULB_DETAILS_KEY), 'ULB details').to.be.a('string');
        });
      },
    },
  );
}

export function loginAsState() {
  login('STATE', Cypress.env('STATE_USER_ID'), Cypress.env('STATE_PASSWORD'));
}

export function loginAsUlb() {
  login('ULB', Cypress.env('XVFCULB_ID'), Cypress.env('XVIFCULB_pass'));
}

export function loginAsMohua() {
  login('MOHUA', Cypress.env('MOHUA_USER_ID'), Cypress.env('MOHUA_PASSWORD'));
}

/** An ADC Admin/Reviewer (role STATE_ADC): ADC_USER_ID / ADC_PASSWORD in .env. */
export function loginAsAdc() {
  login('ADC', Cypress.env('ADC_USER_ID'), Cypress.env('ADC_PASSWORD'));
}

/** The Portal Admin (role ADMIN): ADC management, ULB registration, OCR manual review. */
export function loginAsAdmin() {
  login('ADMIN', Cypress.env('ADMIN_USER_ID'), Cypress.env('ADMIN_PASSWORD'));
}

/** Visits a page of the logged-in workspace, e.g. visitWorkspacePage('sfc-status'). */
export function visitWorkspacePage(route: string) {
  // cy.session restored localStorage before any page loaded, so read it
  // straight from storage rather than visiting a page first.
  cy.getAllLocalStorage().then((storage) => {
    const base = Object.values(storage).map((s) => s[BASE_KEY]).find(Boolean);
    expect(base, 'workspace base from the cached session').to.be.a('string');
    cy.visit(`${base}/${route}`);
  });
}

export const visitStatePage = visitWorkspacePage;

/**
 * Blocks every write (POST/PUT/PATCH/DELETE) except auth calls, so a spec can
 * open forms, type and validate without changing shared staging data. Call it
 * in beforeEach and assert the returned list is empty in afterEach.
 */
export function blockWrites(): string[] {
  const blocked: string[] = [];
  cy.intercept({ url: '**/api/**' }, (req) => {
    if (req.method === 'GET' || req.method === 'OPTIONS' || req.url.includes('/api/v2/auth/')) return;
    blocked.push(`${req.method} ${req.url}`);
    // Not 401/403: the app's HTTP interceptor logs the user out on those,
    // which would also kill the cached session.
    req.reply({ statusCode: 418, body: { success: false, message: 'Blocked by Cypress (read-only spec)' } });
  });
  return blocked;
}
