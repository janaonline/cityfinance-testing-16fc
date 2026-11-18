/**
 * Public (logged-out) global header, navbar and footer, as seen on /home.
 *
 * Built from the cf-ui-ssr-v3 `staging` branch
 * (src/app/shared/components/template/{header,navbar,footer},
 * navbar/nav-menu.config.ts as the menu source of truth,
 * navbar/login-menu.constant.ts, shared/components/user-info-dialog) and
 * environments/environment.staging.ts (v1Url '/v1', v2 '/fc', blogUrl), and
 * checked against staging.
 *
 * Read-only: the "Request a Demo" dialog is opened, validated and cancelled —
 * its submit endpoint is stubbed to fail the test if it is ever called.
 * External links (blog, social, login portals) are asserted by href/target,
 * not followed.
 */
export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const BLOG_URL = 'https://blog.cityfinance.in';
const BASE = Cypress.config('baseUrl');

// Logged-out Dashboard dropdown on a non-production build (nav-menu.config.ts:
// SLB is isDisabled; Municipal Bonds/Budgets are isHiddenInProd but visible on staging).
const DASHBOARD_ITEMS: [string, string][] = [
  ['National Performance', '/municipal-data/national'],
  ['Own Revenue Performance', '/v1/own-revenue-dashboard'],
  ['Municipal Bonds', '/v1/municipal-bonds'],
  ['Municipal Budgets', '/v1/municipal-budgets'],
  ['Market Readiness Assessment', '/municipal-data/market-readiness'],
];

// login-menu.constant.ts: items with isMenu=true → `${ui.urlV2}auth/login/${type}`.
const LOGIN_ITEMS: [string, string, boolean][] = [
  ['XVI FC Grant', `${BASE}/fc/auth/login/16thFC`, true],
  ['XV FC Grant', `${BASE}/fc/auth/login/15thFC`, false],
  ['XVI FC Data Collection', `${BASE}/fc/auth/login/XVIFC`, false],
  ['State Dashboard', `${BASE}/fc/auth/login/state-dashboard`, false],
];

const visitHome = () => {
  cy.visit('/home');
  // Navbar auth state is resolved in the browser; the Login button appears once it is ready.
  cy.contains('app-navbar button', 'Login', { timeout: 20000 }).should('be.visible');
};


/** The phone nav slides in from the left (translateX); "hidden" = fully off-screen. */
const offCanvas = (hidden: boolean) => ($ul: JQuery<HTMLElement>) => {
  const r = $ul[0].getBoundingClientRect();
  if (hidden) expect(r.right, 'menu off-canvas').to.be.at.most(0);
  else expect(r.left, 'menu slid in').to.be.at.least(0);
};
/**
 * Taps the hamburger until the menu reports open. Under load the first tap can
 * land before the server-rendered navbar is hydrated, and Angular drops it.
 */
const openHamburger = (attempts = 5) => {
  cy.get('app-navbar .mobile-nav-ham').should('be.visible').click();
  cy.get('app-navbar').then(($nav) => {
    if ($nav.find('.mobile-nav-ham[aria-expanded="true"], .mobile-nav-cancel').length) return;
    if (attempts <= 1) throw new Error('hamburger never opened the menu');
    openHamburger(attempts - 1);
  });
};
const topLevelLabels = () =>
  cy.get('#primary-navigation > li').then(($li) => Cypress._.map($li, (li) => li.innerText.replace(/\s+/g, ' ').trim()));

describe('Public | Global header, navbar and footer', () => {
  describe('top header strip', () => {
    beforeEach(visitHome);

    afterEach(() => {
      cy.window().then((w) => w.localStorage.removeItem('myLSkey'));
    });

    it('shows the Government of India emblem and ministry name', () => {
      cy.get('app-header img[alt="Emblem of India"]')
        .should('be.visible')
        .and(($img) => expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0));
      cy.get('app-header header').should('contain.text', 'MINISTRY OF HOUSING AND URBAN AFFAIRS | GOVERNMENT OF INDIA');
    });

    it('"Skip To Main Content" scrolls to the Explore section', () => {
      cy.window().its('scrollY').should('eq', 0);
      cy.contains('app-header button', 'Skip To Main Content').click();
      cy.window().its('scrollY').should('be.greaterThan', 200);
      cy.get('#main-content').should(($el) => {
        const top = $el[0].getBoundingClientRect().top;
        expect(top, 'Explore heading near top of viewport').to.be.within(0, 300);
      });
    });

    it('A-/A/A+ buttons switch the root font-size class and remember the choice', () => {
      cy.get('app-header button.text-rg').should('have.class', 'active');
      cy.get('app-header button.text-lg').click();
      cy.get('html').should('have.class', 'lg').and('not.have.class', 'rg');
      cy.window().then((w) => expect(JSON.parse(w.localStorage.getItem('myLSkey')!)).to.deep.eq({ currentTextSize: 'lg' }));
      cy.get('html').then(($h) => {
        const lgSize = parseFloat(getComputedStyle($h[0]).fontSize);
        cy.get('app-header button.text-sm').click();
        cy.get('html').should('have.class', 'sm').and('not.have.class', 'lg');
        cy.get('html').should(($h2) => expect(parseFloat(getComputedStyle($h2[0]).fontSize)).to.be.lessThan(lgSize));
      });
      cy.get('app-header button.text-rg').click();
      cy.get('html').should('have.class', 'rg').and('not.have.class', 'sm');
      cy.window().then((w) => expect(JSON.parse(w.localStorage.getItem('myLSkey')!).currentTextSize).to.eq('rg'));
    });
  });

  describe('navbar (desktop)', () => {
    beforeEach(visitHome);

    it('shows only the logged-out menu: Dashboard, Resources, Blog', () => {
      cy.get('app-navbar nav > .container > a[href="/home"]').should('contain.text', 'city').and('contain.text', 'finance');
      topLevelLabels().should('deep.eq', ['Dashboard', 'Resources', 'Blog']);
      // Logged-in-only items from nav-menu.config.ts must not leak.
      ['15th FC Grants', '16th FC Grants', 'My Forms', 'State Dashboard', 'Review XVI FC', 'Users', 'OCR']
        .forEach((t) => cy.get('#primary-navigation').should('not.contain.text', t));
      cy.get('app-navbar .mobile-nav-ham').should('not.be.visible');
      cy.get('app-navbar .bi-person-circle').should('not.exist');
    });

    it('the logo links back to /home', () => {
      cy.visit('/municipal-data/national');
      cy.get('app-navbar nav > .container > a[href="/home"]').click();
      cy.location('pathname').should('eq', '/home');
    });

    it('Dashboard dropdown lists every logged-out dashboard with the right target', () => {
      cy.contains('#primary-navigation a.nav-link', 'Dashboard').click();
      cy.get('.mat-mdc-menu-panel a[mat-menu-item]').should('have.length', DASHBOARD_ITEMS.length).each(($a, i) => {
        const [label, href] = DASHBOARD_ITEMS[i];
        expect($a.text().trim()).to.eq(label);
        expect($a.attr('href')).to.eq(href);
        if (href.startsWith('/v1')) expect($a.attr('target')).to.eq('_self');
      });
      cy.get('.mat-mdc-menu-panel').should('not.contain.text', 'Service Level Benchmarks');
      cy.get('.cdk-overlay-backdrop').click({ force: true }); // clicking outside closes the menu
      cy.get('.mat-mdc-menu-panel').should('not.exist');
    });

    it('every Dashboard target is served', () => {
      DASHBOARD_ITEMS.forEach(([, href]) => cy.request(href).its('status').should('eq', 200));
    });

    it('Dashboard › National Performance routes in-app to the national dashboard', () => {
      cy.contains('#primary-navigation a.nav-link', 'Dashboard').click();
      cy.contains('.mat-mdc-menu-panel a', 'National Performance').should('be.visible').then(($a) => $a[0].click()); // native click: the menu re-renders while Cypress waits on actionability
      cy.location('pathname').should('eq', '/municipal-data/national');
      // In-app route: the dropdown trigger is now marked active.
      cy.contains('#primary-navigation a.nav-link', 'Dashboard').should('have.class', 'active');
    });

    it('Dashboard › Market Readiness Assessment routes in-app', () => {
      cy.contains('#primary-navigation a.nav-link', 'Dashboard').click();
      cy.contains('.mat-mdc-menu-panel a', 'Market Readiness Assessment').should('be.visible').then(($a) => $a[0].click()); // native click: the menu re-renders while Cypress waits on actionability
      cy.location('pathname').should('eq', '/municipal-data/market-readiness');
    });

    it('Dashboard › Own Revenue Performance opens the v1 app', () => {
      cy.intercept('GET', '**/v1/own-revenue-dashboard').as('v1Doc');
      cy.contains('#primary-navigation a.nav-link', 'Dashboard').click();
      cy.contains('.mat-mdc-menu-panel a', 'Own Revenue Performance').should('be.visible').then(($a) => $a[0].click()); // native click: the menu re-renders while Cypress waits on actionability
      // The browser leaves the SSR app for the v1 document (the v1 SPA sometimes then
      // redirects itself to /v1/, so assert on the document request, not the final URL).
      cy.wait('@v1Doc').its('response.statusCode').should('be.oneOf', [200, 304]);
      cy.location('pathname', { timeout: 30000 }).should('match', /^\/v1\//);
    });

    it('Resources links to the v1 data-sets page in the same tab', () => {
      cy.contains('#primary-navigation a.nav-link', 'Resources')
        .should('have.attr', 'href', '/v1/resources-dashboard/data-sets/income_statement')
        .and('have.attr', 'target', '_self')
        .click();
      cy.location('pathname', { timeout: 30000 }).should('eq', '/v1/resources-dashboard/data-sets/income_statement');
    });

    it('Blog points to the external blog in a new tab', () => {
      cy.contains('#primary-navigation a.nav-link', 'Blog')
        .should('have.attr', 'href', BLOG_URL)
        .and('have.attr', 'target', '_blank');
    });

    it('Login menu lists every portal login with the right link and a NEW badge on XVI FC', () => {
      cy.contains('app-navbar button', 'Login').click();
      cy.get('.mat-mdc-menu-panel a[mat-menu-item]').should('have.length', LOGIN_ITEMS.length).each(($a, i) => {
        const [label, href, isNew] = LOGIN_ITEMS[i];
        expect($a.text().replace(/\s+/g, '')).to.eq((isNew ? `${label}NEW` : label).replace(/\s+/g, ''));
        expect($a.attr('href')).to.eq(href);
        expect($a.find('.badge-new').length, `${label} NEW badge`).to.eq(isNew ? 1 : 0);
        if (isNew) expect($a.find('strong').text().trim()).to.eq(label);
      });
      cy.get('.cdk-overlay-backdrop').click({ force: true }); // clicking outside closes the menu
      cy.get('.mat-mdc-menu-panel').should('not.exist');
    });

    it('every Login portal page is served', () => {
      LOGIN_ITEMS.forEach(([, href]) => cy.request(href).its('status').should('eq', 200));
    });
  });

  describe('"Request a Demo" dialog (opened, validated, cancelled — never submitted)', () => {
    beforeEach(() => {
      cy.intercept('POST', '**/request-demo/postDemoData', (req) => {
        throw new Error(`Request-a-demo form was submitted: ${JSON.stringify(req.body)}`);
      });
      cy.intercept('GET', '**/api/v1/request-demo/getDemoForm').as('demoForm');
      visitHome();
      cy.contains('app-navbar button', 'Request a Demo').click();
    });

    it('renders the form fields served by the API', () => {
      cy.wait('@demoForm').then(({ response }) => {
        const form = response!.body.data;
        const fields = Cypress._.sortBy(form.data, 'position');
        cy.get('mat-dialog-container h2').should('have.text', form.title);
        cy.get('mat-dialog-container mat-dialog-content p small').should('have.text', form.desc);
        cy.get('mat-dialog-container mat-form-field').should('have.length', fields.length);
        fields.forEach((f: any) => {
          cy.get(`mat-dialog-container input#${f.key}`).should('exist');
          cy.contains('mat-dialog-container mat-label', f.label).should('exist');
        });
        cy.contains('mat-dialog-container button', 'Submit').should('be.disabled');
      });
    });

    it('shows required / length / email validation messages and keeps Submit disabled', () => {
      cy.wait('@demoForm').then(({ response }) => {
        const fields = Cypress._.sortBy(response!.body.data.data, 'position') as any[];
        const msg = (key: string, name: string) =>
          fields.find((f) => f.key === key).validations.find((v: any) => v.name === name).message;
        const field = (key: string) => cy.get(`mat-dialog-container input#${key}`).closest('mat-form-field');

        // Touch each field and leave it empty → required message.
        fields.forEach((f) => cy.get(`mat-dialog-container input#${f.key}`).focus().blur());
        fields.forEach((f) => field(f.key).find('mat-error').should('contain.text', msg(f.key, 'required')));

        // Too short / too long first name.
        cy.get('mat-dialog-container input#firstName').type('ab').blur();
        field('firstName').find('mat-error').should('contain.text', msg('firstName', 'minlength'));
        cy.get('mat-dialog-container input#firstName').clear().type('abcdefghijklmnopq').blur();
        field('firstName').find('mat-error').should('contain.text', msg('firstName', 'maxlength'));

        // Malformed email.
        cy.get('mat-dialog-container input#email').type('not-an-email').blur();
        field('email').find('mat-error').should('contain.text', msg('email', 'email'));

        // Valid values clear the errors, but the form is still incomplete.
        cy.get('mat-dialog-container input#firstName').clear().type('Cypress').blur();
        field('firstName').find('mat-error').should('not.exist');
        cy.contains('mat-dialog-container button', 'Submit').should('be.disabled');
      });
    });

    it('Cancel closes the dialog without submitting', () => {
      cy.wait('@demoForm');
      cy.get('mat-dialog-container input#firstName').type('Cypress');
      cy.contains('mat-dialog-container button', 'Cancel').click();
      cy.get('mat-dialog-container').should('not.exist');
      cy.location('pathname').should('eq', '/home');
    });
  });

  describe('navbar (phone viewport)', () => {
    beforeEach(() => {
      cy.viewport('iphone-x');
      visitHome();
    });

    it('hides the menu behind a hamburger that opens and closes it', () => {
      cy.get('app-header header > .container').should('not.be.visible'); // ministry strip is desktop-only
      cy.get('#primary-navigation').should(offCanvas(true));
      cy.get('app-navbar .mobile-nav-ham').should('be.visible').and('have.attr', 'aria-expanded', 'false');
      openHamburger();

      cy.get('#primary-navigation').should('have.class', 'primary-navigation-data-visible');
      cy.get('app-navbar .mobile-nav-ham').should('have.attr', 'aria-expanded', 'true');
      topLevelLabels().should('deep.eq', ['Dashboard', 'Resources', 'Blog']);
      cy.get('#primary-navigation').should(offCanvas(false));

      // Dashboard dropdown still works on mobile.
      cy.contains('#primary-navigation a.nav-link', 'Dashboard').click();
      cy.get('.mat-mdc-menu-panel a[mat-menu-item]').should('have.length', DASHBOARD_ITEMS.length);
      cy.get('.cdk-overlay-backdrop').click({ force: true });
      cy.get('.mat-mdc-menu-panel').should('not.exist');

      cy.get('app-navbar .mobile-nav-cancel').should('be.visible').click();
      cy.get('#primary-navigation').should('not.have.class', 'primary-navigation-data-visible');
      cy.get('app-navbar .mobile-nav-cancel').should('not.exist');
      cy.get('#primary-navigation').should(offCanvas(true));
    });

    it('keeps Login reachable outside the hamburger menu', () => {
      cy.contains('app-navbar button', 'Login').should('be.visible').click();
      cy.get('.mat-mdc-menu-panel a[mat-menu-item]').should('have.length', LOGIN_ITEMS.length);
    });
  });

  describe('footer', () => {
    // footer.ts
    const FOOTER_LINKS: [string, string, string][] = [
      ['Home', '/home', '_self'],
      ['Financial', '/municipal-data/national', '_self'],
      ['Own Revenue Performance', '/v1/own-revenue-dashboard', '_self'],
      ['Service Level Benchmarks Performance', '/v1/dashboard/slb', '_self'],
      ['Resources', '/v1/resources-dashboard/learning-center/toolkits', '_self'],
      ['Blog', BLOG_URL, '_blank'],
    ];
    const SOCIAL: [string, string][] = [
      ['facebook-mohua', 'https://www.facebook.com/mohua.india'],
      ['twitter-mohua', 'https://twitter.com/MoHUA_India'],
      ['linkedin-mohua', 'https://www.linkedin.com/company/mohua/'],
    ];

    beforeEach(visitHome);

    it('shows the brand, description and MoHUA address', () => {
      cy.get('app-footer a[href="/home"]').first().should('contain.text', 'city').and('contain.text', 'finance.in');
      cy.get('app-footer').should('contain.text', 'Cityfinance.in serves as a national framework of standardized');
      cy.get('app-footer .info-dir').invoke('prop', 'innerText').then((t: string) => {
        expect(t.split('\n').map((l) => l.trim()).filter(Boolean)).to.deep.eq([
          'Ministry of Housing and Urban Affairs', 'Sankalp Bhawan, GPOA-2',
          'Pt. Ravi Shankar Shukla Lane', 'New Delhi-110001',
        ]);
      });
    });

    it('lists the quick links with the right targets', () => {
      cy.get('app-footer .footer > div').eq(1).find('a').should('have.length', FOOTER_LINKS.length).each(($a, i) => {
        const [title, href, target] = FOOTER_LINKS[i];
        expect($a.text().trim()).to.eq(title);
        expect($a.attr('href')).to.eq(href);
        expect($a.attr('target')).to.eq(target);
      });
    });

    it('every internal quick link is served', () => {
      FOOTER_LINKS.filter(([, href]) => href.startsWith('/'))
        .forEach(([, href]) => cy.request(href).its('status').should('eq', 200));
    });

    it('the "Financial" quick link opens the national dashboard', () => {
      cy.contains('app-footer a', 'Financial').click();
      cy.location('pathname').should('eq', '/municipal-data/national');
    });

    it('shows the contact e-mail as a mailto link', () => {
      cy.contains('app-footer p', 'Email:').next('a')
        .should('have.attr', 'href', 'mailto:contact@cityfinance.in')
        .invoke('text').invoke('trim').should('eq', 'contact@cityfinance.in');
    });

    it('links to MoHUA social profiles', () => {
      cy.contains('app-footer p', 'Connect With Us:').parent().find('a').should('have.length', SOCIAL.length).each(($a, i) => {
        const [alt, href] = SOCIAL[i];
        expect($a.attr('href')).to.eq(href);
        // Source uses target="blank" (a named window) rather than "_blank" — still opens a new tab.
        expect($a.attr('target')).to.match(/^_?blank$/);
        const img = $a.find('img')[0] as HTMLImageElement;
        expect(img.alt).to.eq(alt);
        expect(img.naturalWidth, `${alt} icon loaded`).to.be.greaterThan(0);
      });
    });

    it('shows the visitor counter from the visit_count API', () => {
      cy.get('app-footer').contains('span', /^Visitors:/).invoke('text').then((t) => {
        const shown = Number(t.replace(/\D/g, ''));
        expect(shown, 'visitor count').to.be.greaterThan(0);
        // Counter is read at render time; the API value can only have grown since.
        cy.request('/api/v1/visit_count').its('body.data').then((api: number) => {
          expect(shown).to.be.at.most(api);
          expect(shown).to.be.at.least(api - 1000);
        });
      });
    });
  });
});
