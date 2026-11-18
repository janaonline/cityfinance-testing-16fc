/**
 * Public Login page (server-side rendered).
 * URL: /auth/login
 *
 * Built from the cf-ui-ssr-v3 `staging` branch (src/app/pages/auth/login/*,
 * core/services/auth.service.ts, core/guards/auth.guard.ts guestOnlyGuard)
 * and checked against staging.
 *
 * The SSR login is a single identifier + password form: it has no role picker,
 * "forgot password" or "register" links (those live on the /fc portal logins
 * reached from the navbar Login menu, covered in PublicHeaderFooter).
 *
 * Account-safety rules (staging locks accounts on repeated failures):
 *  - valid credentials are never used;
 *  - exactly ONE submission reaches the API, with the obviously fake
 *    identifier 'cypress-nonexistent-user';
 *  - every other test stubs the login endpoint to fail if it is called.
 */
export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const LOGIN_API = '**/api/v2/auth/login';
const FAKE_ID = 'cypress-nonexistent-user';

/** Fails the test if the form ever reaches the login API. */
const forbidLoginCalls = () => {
  cy.intercept('POST', LOGIN_API, (req) => {
    throw new Error(`Login API must not be called here (body: ${JSON.stringify(req.body)})`);
  });
};

/**
 * KNOWN BUG (login.ts): the component is OnPush in a zoneless app and the HTTP
 * callbacks never call markForCheck(), so after a failed login the error banner
 * does not render and the button stays "Signing in..." (disabled) until some
 * other event triggers change detection. A no-op edit of the identifier is that
 * "next interaction".
 */
const nudge = () => cy.get('input#identifier').type(' {backspace}');

const visitLogin = () => {
  cy.visit('/auth/login');
  // The submit button is disabled until the session check finishes.
  cy.get('button.submit-btn', { timeout: 20000 }).should('be.enabled');
};

describe('Public | Login page', () => {
  it('is server-side rendered', () => {
    cy.request('/auth/login').then(({ status, body }) => {
      expect(status).to.eq(200);
      expect(body).to.contain('Sign in to City Finance');
      expect(body).to.contain('id="identifier"');
      expect(body).to.contain('id="password"');
    });
  });

  describe('form', () => {
    beforeEach(() => {
      forbidLoginCalls();
      visitLogin();
    });

    it('shows the heading, copy and labelled fields', () => {
      cy.get('.login-copy .eyebrow').should('have.text', 'Secure access');
      cy.get('h1#login-title').should('have.text', 'Sign in to City Finance');
      cy.get('.login-panel').should('have.attr', 'aria-labelledby', 'login-title');
      cy.get('.login-copy .subtitle').should('contain.text', 'Use your account to continue to protected dashboard experiences.');
      cy.get('label[for="identifier"]').should('have.text', 'Identifier');
      cy.get('label[for="password"]').should('have.text', 'Password');
      cy.get('input#identifier')
        .should('have.attr', 'type', 'text')
        .and('have.attr', 'autocomplete', 'username')
        .and('have.attr', 'placeholder', 'Enter your identifier (email or username)')
        .and('have.value', '');
      cy.get('input#password')
        .should('have.attr', 'type', 'password')
        .and('have.attr', 'autocomplete', 'current-password')
        .and('have.attr', 'placeholder', 'Enter your password')
        .and('have.value', '');
      cy.get('button.submit-btn').should('have.attr', 'type', 'submit').invoke('text').invoke('trim').should('eq', 'Sign in');
      cy.get('.status-banner').should('not.exist'); // session check done, no error yet
      cy.get('form.login-form').should('have.attr', 'aria-busy', 'false');
      // Logged-out navbar is still shown above the form.
      cy.contains('app-navbar button', 'Login').should('be.visible');
    });

    it('flags both fields as required when submitted empty, without calling the API', () => {
      cy.get('.field-error').should('not.exist');
      cy.get('button.submit-btn').click();
      cy.get('#identifier-error').should('be.visible').and('have.text', ' Identifier is required. ');
      cy.get('#password-error').should('be.visible').and('have.text', ' Password is required. ');
      cy.get('input#identifier').should('have.attr', 'aria-invalid', 'true');
      cy.get('input#password').should('have.attr', 'aria-invalid', 'true');
      cy.location('pathname').should('eq', '/auth/login');
    });

    it('shows a field error on blur and clears it once the field is filled', () => {
      cy.get('input#identifier').focus().blur();
      cy.get('#identifier-error').should('be.visible');
      cy.get('#password-error').should('not.exist');
      cy.get('input#identifier').type(FAKE_ID);
      cy.get('#identifier-error').should('not.exist');
      cy.get('input#identifier').should('have.attr', 'aria-invalid', 'false');

      cy.get('input#password').focus().blur();
      cy.get('#password-error').should('be.visible');
      cy.get('input#password').type('x');
      cy.get('#password-error').should('not.exist');

      // Clearing a filled field brings the error back.
      cy.get('input#identifier').clear().blur();
      cy.get('#identifier-error').should('be.visible');
    });

    it('does not submit when only the identifier is filled', () => {
      cy.get('input#identifier').type(FAKE_ID);
      cy.get('input#identifier').type('{enter}'); // Enter submits the form too
      cy.get('#password-error').should('be.visible');
      cy.get('#identifier-error').should('not.exist');
      cy.get('.status-banner.error').should('not.exist');
    });

    it('does not submit when only the password is filled', () => {
      cy.get('input#password').type('not-a-real-password');
      cy.get('button.submit-btn').click();
      cy.get('#identifier-error').should('be.visible');
      cy.get('#password-error').should('not.exist');
    });

    it('toggles password visibility with Show / Hide', () => {
      cy.get('input#password').type('Secret123');
      cy.get('button.password-toggle')
        .should('have.text', ' Show ')
        .and('have.attr', 'aria-label', 'Show password')
        .and('have.attr', 'type', 'button') // must not submit the form
        .click();
      cy.get('input#password').should('have.attr', 'type', 'text').and('have.value', 'Secret123');
      cy.get('button.password-toggle').should('have.text', ' Hide ').and('have.attr', 'aria-label', 'Hide password').click();
      cy.get('input#password').should('have.attr', 'type', 'password').and('have.value', 'Secret123');
      cy.get('.field-error').should('not.exist');
    });

    it('"Return to home" goes back to /home', () => {
      cy.get('.support-copy').should('contain.text', 'Need help accessing your account?');
      cy.contains('.support-copy a', 'Return to home').should('have.attr', 'href', '/home').click();
      cy.location('pathname').should('eq', '/home');
    });
  });

  describe('submission states (login API stubbed — no request reaches the server)', () => {
    /** Expected banner text for a failed login, mirroring login.ts getErrorMessage(). */
    const expectedError = (status: number, body: any) => {
      const backend = [body?.message, body?.error, body?.msg].find((m) => typeof m === 'string' && m.trim());
      if (backend) return backend;
      if (status === 0) return 'We could not reach the server. Please try again.';
      if (status === 401 || status === 403) return 'Incorrect identifier or password.';
      return 'We could not sign you in right now. Please try again.';
    };

    const fillAndSubmit = () => {
      cy.get('input#identifier').type(FAKE_ID);
      cy.get('input#password').type('not-a-real-password');
      cy.get('button.submit-btn').click();
    };

    beforeEach(visitLogin);

    it('shows "Signing in..." and disables the button while the request is in flight', () => {
      cy.intercept('POST', LOGIN_API, { statusCode: 401, body: {}, delay: 1500 }).as('login');
      fillAndSubmit();
      cy.get('button.submit-btn').should('be.disabled').and('contain.text', 'Signing in...');
      cy.get('form.login-form').should('have.attr', 'aria-busy', 'true');
      cy.get('form.login-form').submit(); // a second submit (e.g. Enter) is ignored while in flight
      cy.wait('@login');
      cy.get('@login.all').should('have.length', 1);
    });

    it('KNOWN BUG: the failure is only rendered after the next interaction', () => {
      cy.intercept('POST', LOGIN_API, { statusCode: 401, body: {} }).as('login');
      fillAndSubmit();
      cy.wait('@login');
      cy.get('button.submit-btn').should('contain.text', 'Signing in...').and('be.disabled');
      cy.get('.status-banner.error').should('not.exist');
      nudge();
      cy.get('.status-banner.error').invoke('text').invoke('trim').should('eq', expectedError(401, {}));
      cy.get('button.submit-btn').should('be.enabled').and('contain.text', 'Sign in');
    });

    [
      { name: '401 without a message', status: 401, body: {} },
      { name: '403 without a message', status: 403, body: {} },
      { name: '500 without a message', status: 500, body: {} },
      { name: 'a backend "message"', status: 400, body: { message: 'Stubbed: user not found' } },
      { name: 'a backend "error"', status: 400, body: { error: 'Stubbed: account locked' } },
      { name: 'a backend "msg"', status: 422, body: { msg: 'Stubbed: invalid identifier' } },
    ].forEach(({ name, status, body }) => {
      it(`shows the right error for ${name}`, () => {
        cy.intercept('POST', LOGIN_API, { statusCode: status, body }).as('login');
        fillAndSubmit();
        cy.wait('@login');
        nudge();
        cy.get('.status-banner.error')
          .should('have.attr', 'role', 'alert')
          .invoke('text').invoke('trim').should('eq', expectedError(status, body));
        cy.location('pathname').should('eq', '/auth/login');
      });
    });

    it("shows the interceptor's connectivity error when the server cannot be reached", () => {
      // custom-http.interceptor.ts rewrites status-0 errors to { error: { message: 'Failed to connect with Server' } },
      // so login.ts's own 'We could not reach the server' branch is unreachable.
      cy.intercept('POST', LOGIN_API, { forceNetworkError: true }).as('login');
      fillAndSubmit();
      cy.wait('@login');
      // A forced network error reaches the app slightly after the intercept resolves, and
      // nothing on screen reflects it (KNOWN BUG above) — give it a moment before nudging.
      cy.then(() => {
        const t0 = Date.now();
        cy.wrap(null).should(() => expect(Date.now() - t0).to.be.greaterThan(1000));
      });
      nudge();
      cy.get('.status-banner.error').invoke('text').invoke('trim')
        .should('eq', 'Failed to connect with Server');
    });

    it('clears the previous error when submitting again', () => {
      cy.intercept('POST', LOGIN_API, { statusCode: 401, body: {}, delay: 800 }).as('login');
      fillAndSubmit();
      cy.wait('@login');
      nudge();
      cy.get('.status-banner.error').should('exist');
      cy.get('button.submit-btn').click();
      cy.get('.status-banner.error').should('not.exist');
      cy.get('button.submit-btn').should('contain.text', 'Signing in...');
      cy.wait('@login');
    });
  });

  describe('session handling', () => {
    it('KNOWN BUG: an expired stale session (refresh → 440) is sent to the missing /login route and lands on /home', () => {
      // custom-http.interceptor.ts navigateToLogin() and auth.guard.ts use ['/login'],
      // but the login route is 'auth/login'; the '**' wildcard then redirects to /home.
      // Expected once fixed: /auth/login?returnUrl=...
      forbidLoginCalls();
      cy.intercept('POST', '**/api/v2/auth/refresh').as('refresh');
      cy.visit('/auth/login', {
        // auth.service.ts restores the session on bootstrap when this hint is present.
        onBeforeLoad: (w) => w.localStorage.setItem('auth_session_hint', 'true'),
      });
      cy.wait('@refresh').its('response.statusCode').then((status) => {
        expect(status, 'refresh rejected').to.be.within(400, 499);
        if (status === 440 || status === 441) {
          cy.location('pathname').should('eq', '/home');
          cy.location('search').should('contain', 'returnUrl=');
        } else {
          cy.location('pathname').should('eq', '/auth/login');
        }
      });
      cy.window().its('localStorage').invoke('getItem', 'auth_session_hint').should('be.null');
      cy.contains('app-navbar button', 'Login', { timeout: 20000 }).should('be.visible'); // still logged out
    });

    it('KNOWN BUG: a protected route sends a logged-out visitor to /home instead of the login page', () => {
      // auth.guard.ts authGuard → createUrlTree(['/login']) (missing route) → '**' → /home.
      cy.visit('/ulb/000000000000000000000000/some-indicator');
      cy.location('pathname').should('eq', '/home');
      cy.location('search').should('contain', 'returnUrl=');
    });

    it('a logged-out visitor can open the login page with a returnUrl (guestOnlyGuard lets them through)', () => {
      cy.visit('/auth/login?returnUrl=%2Fmunicipal-data%2Fnational');
      cy.location('pathname').should('eq', '/auth/login');
      cy.get('h1#login-title').should('be.visible');
    });
  });

  describe('invalid credentials (the only real login call — fake identifier, once)', () => {
    it('is rejected by the API, shows its error and stores no session', () => {
      cy.intercept('POST', LOGIN_API).as('login');
      visitLogin();
      cy.get('input#identifier').type(FAKE_ID);
      cy.get('input#password').type(`Cypress-${Date.now()}`, { log: false });
      cy.get('button.submit-btn').click();

      cy.wait('@login').then(({ request, response }) => {
        expect(request.body.identifier).to.eq(FAKE_ID);
        expect(response!.statusCode, 'login rejected').to.be.within(400, 499);
        const b = response!.body || {};
        const backend = [b.message, b.error, b.msg].find((m) => typeof m === 'string' && m.trim());
        const expected = backend
          || ([401, 403].includes(response!.statusCode)
            ? 'Incorrect identifier or password.'
            : 'We could not sign you in right now. Please try again.');
        nudge(); // see KNOWN BUG above: the result renders on the next interaction
        cy.get('.status-banner.error')
          .should('be.visible')
          .and('have.attr', 'role', 'alert')
          .invoke('text').invoke('trim').should('eq', expected);
      });
      cy.get('button.submit-btn').should('be.enabled').and('contain.text', 'Sign in');
      cy.location('pathname').should('eq', '/auth/login');
      cy.get('@login.all').should('have.length', 1);
      cy.window().then((w) => {
        expect(w.localStorage.getItem('auth_session_hint'), 'no session hint stored').to.be.null;
        expect(w.localStorage.getItem('userData'), 'no user stored').to.be.null;
      });
      cy.contains('app-navbar button', 'Login').should('be.visible'); // still logged out
    });
  });
});
