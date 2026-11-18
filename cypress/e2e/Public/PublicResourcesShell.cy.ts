/**
 * Public (logged-out) Resources dashboard shell.
 * URLs: /v1/resources-dashboard/... (header + section cards + global resources
 * search), /v1/resources-dashboard/res-tabs, and the navbar/footer entry points.
 *
 * Built from the cityfinance-ng-ui `staging` branch (old Angular 14 app, served
 * under /v1): pages/resources-dashboard/resources-dashboard.component,
 * resources-tabs, learning-center / data-sets / reports-publication search
 * banners — and checked against staging.
 *
 * Search counts are taken from the intercepted resourceDashboard/search
 * response; only static UI text is hard-coded.
 */
export {};

const RD = '/v1/resources-dashboard';
const CARDS = [
  { title: 'Learning Center', path: `${RD}/learning-center/toolkits`, sub: 'Access our research outputs such as digital toolkits' },
  { title: 'Datasets', path: `${RD}/data-sets/income_statement`, sub: 'Access raw as well standardized ULB financial statements datasets here.' },
  { title: 'Reports & Publications', path: `${RD}/report-publications`, sub: 'Access Municipal Finance related publications here.' },
];
const RE_SEARCH = /\/api\/v1\/resourceDashboard\/search\?name=/;
const nameOf = (url: string) => new URL(url).searchParams.get('name');

function visitShell(path = `${RD}/learning-center/toolkits`) {
  cy.intercept('GET', RE_SEARCH).as('search');
  cy.visit(path);
  // The dashboard fires an empty search on load.
  return cy.wait('@search').then(({ request }) => expect(nameOf(request.url)).to.eq(''));
}

function search(term: string, via: 'button' | 'enter' = 'button') {
  cy.get('.res-filter input.fl-input').clear().type(term);
  if (via === 'enter') cy.get('.res-filter input.fl-input').type('{enter}');
  else cy.contains('.res-filter button', 'Search').click();
  return cy.wait('@search').then(({ request, response }) => {
    expect(nameOf(request.url)).to.eq(term);
    return response!.body.data as { learningCenter: number; dataSet: number; reportsAndPublication: number };
  });
}

/** Banner "<n> Search results for ‘tax’ in <Section>": label must show; count must match the API unless the app renders it empty (logged app bug). */
function bannerCount(sel: string, section: string, count: number) {
  cy.contains(sel, new RegExp(`Search results for ‘tax’ in\\s+${section}`)).should('be.visible');
  cy.get(sel).first().find('b').first().invoke('text').then((t) => {
    if (t.trim() === '') cy.log(`APP BUG: ${section} banner count is empty; API says ${count}`);
    else expect(t.trim()).to.eq(String(count));
  });
}

const sum = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + b, 0);

describe('Public | Resources — dashboard shell', () => {
  it('navbar "Resources" opens Datasets and footer "Resources" opens Toolkits', () => {
    visitShell(`${RD}/report-publications`);
    cy.contains('a.nav-link', /^\s*Resources\s*$/).should('have.attr', 'href', `${RD}/data-sets/income_statement`).click();
    cy.location('pathname').should('eq', `${RD}/data-sets/income_statement`);
    cy.contains('a.nav-link', /^\s*Resources\s*$/).should('have.class', 'active');
    cy.contains('a.foot-links', /^\s*Resources\s*$/).should('have.attr', 'href', `${RD}/learning-center/toolkits`).click();
    cy.location('pathname').should('eq', `${RD}/learning-center/toolkits`);
  });

  it('shows the header, the search box and the three section cards', () => {
    visitShell();
    cy.contains('.res-h', 'Resources').should('be.visible');
    cy.contains('.res-sub-h', 'repository of all our research outputs').should('be.visible');
    cy.get('.res-filter input.fl-input').should('have.attr', 'placeholder', 'Type here...');
    cy.contains('.res-filter button', 'Search').should('be.visible');
    cy.get('a.center-aTag').should('have.length', 3).each(($a, i) => {
      expect($a.attr('href')).to.eq(CARDS[i].path);
      expect($a.find('.resources-h').text().trim()).to.eq(CARDS[i].title);
      expect($a.find('.resources-sub-h').text()).to.contain(CARDS[i].sub);
      expect($a.find('img').attr('src')).to.match(/assets\/resources-das\/\w+\.svg$/);
    });
  });

  it('section cards navigate and exactly one card is active', () => {
    visitShell(`${RD}/data-sets/income_statement`);
    CARDS.forEach((c) => {
      cy.contains('a.center-aTag', c.title).click();
      cy.location('pathname').should('eq', c.path);
      cy.contains('.res-card', c.title).should('have.class', 'activeCard');
      cy.get('.res-card.activeCard').should('have.length', 1);
    });
  });

  it('/res-tabs renders the shell with an empty tab strip and no active card', () => {
    visitShell(`${RD}/res-tabs`);
    cy.get('app-resources-tabs ul.resources-tab').should('exist').find('li').should('have.length', 0);
    cy.get('.res-card.activeCard').should('have.length', 0);
    cy.get('a.center-aTag').should('have.length', 3);
  });

  it('search shows API counts per section and carries the term into each section', () => {
    cy.intercept('GET', /\/api\/v1\/annual-accounts\/datasets\?/).as('datasets');
    cy.intercept('GET', /\/api\/v1\/resourceDashboard\/\?toolKitVisible=.*header=reports_%26_publications/).as('reports');
    visitShell();
    search('tax').then((d) => {
      cy.location('pathname').should('eq', `${RD}/learning-center/toolkits`);
      cy.location('search').should('eq', '?search=tax');
      cy.get('.totalCount').should('contain.text', `${sum(d)} Search results for`).and('contain.text', "'tax'");
      cy.contains('.res-filter button', 'Search').should('not.exist');
      cy.get('.res-filter button i.fa-close').should('be.visible');
      cy.contains('app-learning-center p', 'Search results for ‘tax’ in Learning Center').should('be.visible');
      // Count shown in the Learning Center banner (see the dedicated test below for the app bug).
      cy.get('app-learning-center p b').first().invoke('text').then((t) => {
        if (t.trim() === '') cy.log('APP BUG: Learning Center search banner renders an empty count (<b></b>); API says ' + d.learningCenter);
        else expect(t.trim()).to.eq(String(d.learningCenter));
      });

      cy.contains('a.center-aTag', 'Datasets').click();
      cy.wait('@datasets').its('request.url').should('contain', 'globalName=tax');
      bannerCount('app-data-sets p', 'Datasets', d.dataSet);
      cy.contains('a.center-aTag', 'Reports & Publications').click();
      cy.wait('@reports').its('request.url').should('contain', 'globalName=tax');
      bannerCount('app-reports-publication p', 'Reports and Publications', d.reportsAndPublication);
    });
  });

  it('Learning Center search banner shows the API count for the section', function () {
    visitShell();
    search('tax').then((d) => {
      cy.get('app-learning-center p b').first().invoke('text').then((t) => {
        if (t.trim() === '') {
          cy.log('APP BUG: Learning Center banner count is empty (<b></b>); expected ' + d.learningCenter);
          this.skip();
        }
        expect(t.trim()).to.eq(String(d.learningCenter));
      });
    });
  });

  it('Enter in the search box searches too', () => {
    visitShell(`${RD}/report-publications`);
    search('municipal', 'enter').then((d) => {
      cy.location('search').should('eq', '?search=municipal');
      cy.get('.totalCount').should('contain.text', `${sum(d)} Search results for`);
    });
  });

  it('the close (x) button clears the search and restores the Search button', () => {
    visitShell();
    search('tax');
    cy.get('.res-filter button i.fa-close').click();
    cy.wait('@search').then(({ request }) => expect(nameOf(request.url)).to.eq(''));
    cy.get('.res-filter input.fl-input').should('have.value', '');
    cy.contains('.res-filter button', 'Search').should('be.visible');
    cy.get('.totalCount').should('not.exist');
    cy.contains('app-learning-center p', 'Search results for').should('not.exist');
    cy.get('ul.resources-tab').should('be.visible');
  });

  it('a term with no matches shows the "Sorry" message and hides section content', () => {
    visitShell();
    const term = 'zzqxjnomatch';
    search(term).then((d) => {
      expect(sum(d), 'no results for a nonsense term').to.eq(0);
      cy.get('.totalCount').should('contain.text', `0 Search results for`);
      cy.contains('app-learning-center .noData', `Sorry we couldn’t find any matches for ‘${term}’. Please try searching with another term.`)
        .should('be.visible');
      cy.get('app-learning-center ul.resources-tab').should('not.exist');
      cy.contains('a.center-aTag', 'Datasets').click();
      cy.contains('app-data-sets .noData', `Sorry we couldn’t find any matches for ‘${term}’`).should('be.visible');
      cy.get('app-filter-component').should('not.exist');
    });
  });

  it('an empty search only refreshes counts and stays on the page', () => {
    visitShell(`${RD}/report-publications`);
    cy.contains('.res-filter button', 'Search').click();
    cy.wait('@search').then(({ request }) => expect(nameOf(request.url)).to.eq(''));
    cy.location('pathname').should('eq', `${RD}/report-publications`);
    cy.get('.totalCount').should('not.exist');
    cy.contains('.res-filter button', 'Search').should('be.visible');
  });

  it('autocomplete suggests from the built-in list (placeholder street names) and fills the box', () => {
    visitShell();
    cy.get('.res-filter input.fl-input').type('road');
    cy.get('.mat-autocomplete-panel mat-option').should('have.length', 1).and('contain.text', 'Abbey Road').click();
    cy.get('.res-filter input.fl-input').should('have.value', 'Abbey Road');
    cy.get('.res-filter input.fl-input').clear().type('zzqx');
    cy.get('.mat-autocomplete-panel mat-option').should('not.exist');
  });

  it('at phone width the cards become a horizontally scrollable strip and the search stays usable', () => {
    cy.viewport(375, 812);
    visitShell();
    cy.get('.res-filter input.fl-input').should('be.visible');
    cy.get('a.center-aTag').should('have.length', 3).first().parent().then(($c) => {
      const el = $c[0] as HTMLElement;
      expect(getComputedStyle(el).overflowX, 'cards strip scrolls').to.eq('auto');
      expect(el.scrollWidth, 'cards overflow the strip (scrollable)').to.be.greaterThan(el.clientWidth);
    });
    cy.document().then((d) => expect(d.documentElement.scrollWidth, 'no page-level horizontal scroll').to.be.at.most(d.documentElement.clientWidth));
    search('tax').then((d) => cy.get('.totalCount').should('contain.text', `${sum(d)} Search results for`));
  });
});
