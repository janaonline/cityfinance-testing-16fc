/**
 * Shared helpers for the STATE "State Level Conditions" specs.
 *
 * The STATE account is shared and staging locks accounts after repeated
 * logins, so every STATE spec reuses ONE cached session (cy.session with
 * cacheAcrossSpecs) instead of signing in per test. The workspace base path
 * (/fc/xvifc/{yearId}) is captured at login and kept in localStorage, which
 * cy.session restores along with the auth token.
 */

const IDENTIFIER_INPUT = 'input[formcontrolname="identifier"]';
const PASSWORD_INPUT = 'input[formcontrolname="password"]';
const BASE_KEY = 'cy_state_workspace_base';

export function loginAsState() {
  cy.session(
    ['STATE', Cypress.env('STATE_USER_ID')],
    () => {
      cy.visit('/fc/auth/login/16thFC');
      cy.contains('span.role-card__label', 'STATE').click();
      cy.get(IDENTIFIER_INPUT).type(Cypress.env('STATE_USER_ID'), { force: true });
      cy.get(PASSWORD_INPUT).type(Cypress.env('STATE_PASSWORD'), { force: true, log: false });
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
      });
    },
    {
      cacheAcrossSpecs: true,
      validate() {
        cy.window().then((win) => {
          expect(win.localStorage.getItem(BASE_KEY), 'workspace base').to.match(/\/xvifc\/[a-f0-9]{24}$/);
          expect(win.localStorage.getItem('id_token') || win.localStorage.getItem('cf_access_token'), 'auth token')
            .to.be.a('string');
        });
      },
    },
  );
}

/** Visits a STATE workspace page, e.g. visitStatePage('sfc-status'). */
export function visitStatePage(route: string) {
  // cy.session restored localStorage before any page loaded, so read it
  // straight from storage rather than visiting a page first.
  cy.getAllLocalStorage().then((storage) => {
    const base = Object.values(storage).map((s) => s[BASE_KEY]).find(Boolean);
    expect(base, 'workspace base from the STATE session').to.be.a('string');
    cy.visit(`${base}/${route}`);
  });
}

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
    // which would also kill the cached STATE session.
    req.reply({ statusCode: 418, body: { success: false, message: 'Blocked by Cypress (read-only spec)' } });
  });
  return blocked;
}
