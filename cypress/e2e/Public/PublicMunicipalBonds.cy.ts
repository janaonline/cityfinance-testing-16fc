/**
 * Public (logged-out) — Municipal Bonds page of the old Angular app.
 * URL: /v1/municipal-bonds (Dashboard menu → "Municipal Bonds"; staging only,
 * the component redirects to /home when environment.isProduction is true).
 *
 * The route renders MunicipalityBondsProjectsComponent
 * (cityfinance-ng-ui: src/app/shared/components/municipality-bonds-projects),
 * an "Ongoing Infrastructure Projects" table backed by
 * GET /api/v1//UA/get-projects?skip&limit&sortBy&order[&stateName][&ulbName].
 * There are no detail views, issue-detail pages or downloads on this route in
 * the staging branch — everything the template offers (paginator, page size,
 * reset, per-column sort, State/City search, empty state, error alert) is
 * covered below.
 *
 * Built from the cityfinance-ng-ui `staging` branch and checked against
 * staging. Expected values are derived from the intercepted API responses.
 */
export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

type Column = { label: string; key: string };
type ProjectsResponse = {
  columns: Column[];
  total: number;
  success?: boolean;
  data: Record<string, any>[];
};

const PAGE = '/v1/municipal-bonds';
const PROJECTS = '**/UA/get-projects?*';
const NUMERIC_KEYS = ['totalProjectCost', 'totalProjects'];

/** Query params of an intercepted get-projects call (sortBy/order may repeat). */
const paramsOf = (url: string) => new URL(url).searchParams;

/** Mirrors MunicipalBondsService.getProjects' display transform. */
const display = (row: Record<string, any>, key: string): string => {
  if (key === 'ulbShare' || key === 'totalProjectCost') return (row[key] / 100).toFixed(2);
  return String(row[key] ?? '');
};

/** Waits on `alias` until a call satisfies `pred` (the page also reloads on input blur). */
const waitFor = (alias: string, pred: (i: any) => boolean, tries = 5): Cypress.Chainable<any> =>
  cy.wait(alias).then((i: any) => {
    if (pred(i)) return i;
    if (tries <= 1) throw new Error(`no ${alias} call matched`);
    return waitFor(alias, pred, tries - 1);
  });

const headerCell = (label: string) => cy.contains('table thead th p', label.trim()).parents('th');

/** Asserts that the rendered table equals the response. */
const assertTable = (res: ProjectsResponse) => {
  cy.get('table thead th p').should(($p) =>
    expect([...$p].map((p) => p.textContent!.trim())).to.deep.eq(res.columns.map((c) => c.label.trim())));
  if (!res.data.length) {
    cy.get('table tbody').should('not.exist');
    cy.contains('h2', 'No data found').should('be.visible');
    return;
  }
  // One retrying assertion over the whole body (cell-by-cell commands are slow).
  cy.get('table tbody').should(($tb) => {
    const rows = $tb.find('tr');
    expect(rows, 'row count').to.have.length(res.data.length);
    res.data.forEach((row, r) => {
      const tds = rows.eq(r).find('td');
      res.columns.forEach((c, ci) => {
        const td = tds.eq(ci);
        const text = (c.key === 'ulbShare' ? td.find('span.col-4') : td).text().trim();
        expect(text, `row ${r} ${c.key}`).to.eq(display(row, c.key));
        if (NUMERIC_KEYS.includes(c.key)) expect(td, `${c.key} centred`).to.have.class('text-center');
      });
    });
  });
};

describe('Public | Municipal Bonds — Ongoing Infrastructure Projects', () => {
  let first: ProjectsResponse;

  beforeEach(() => {
    cy.intercept('GET', PROJECTS).as('projects');
    cy.visit(PAGE);
    cy.wait('@projects').then((i: any) => {
      expect(i.response.statusCode).to.eq(200);
      first = i.response.body;
    });
  });

  it('loads page 1 with the default state/ULB sort and renders the response', () => {
    cy.get('@projects.all').then((calls: any) => {
      const p = paramsOf(calls[0].request.url);
      expect(p.get('skip')).to.eq('0');
      expect(p.get('limit')).to.eq('10');
      expect(p.getAll('sortBy')).to.deep.eq(['stateName', 'ulbName']);
      expect(p.getAll('order')).to.deep.eq(['1', '1']);
    });
    cy.contains('h1', 'Ongoing Infrastructure Projects').should('be.visible');
    cy.then(() => {
      expect(first.success, 'API success').to.eq(true);
      expect(first.columns.map((c) => c.key)).to.include.members(['stateName', 'ulbName']);
      assertTable(first);
      cy.get('.mat-paginator-range-label')
        .invoke('text')
        .should('match', new RegExp(`1\\s–\\s${Math.min(10, first.total)}\\sof\\s${first.total}`));
    });
  });

  it('only State and City columns are searchable; every column header is sortable', () => {
    cy.then(() => {
      first.columns.forEach((c) => {
        headerCell(c.label).find('i.fa').should('have.class', 'fa-sort');
        headerCell(c.label)
          .find('input[placeholder="Search"]')
          .should(['stateName', 'ulbName'].includes(c.key) ? 'exist' : 'not.exist');
      });
    });
  });

  it('draws the ULB share progress bar as ulbShare / totalProjectCost', () => {
    cy.then(() => {
      const idx = first.columns.findIndex((c) => c.key === 'ulbShare');
      if (idx < 0 || !first.data.length) {
        cy.log('No ulbShare column / rows on staging');
        return;
      }
      first.data.slice(0, 3).forEach((row, r) => {
        const pct = (+display(row, 'ulbShare') / +display(row, 'totalProjectCost')) * 100;
        cy.get('table tbody tr').eq(r).find('td').eq(idx).find('.progress-bar')
          .should(($b) => {
            if (Number.isFinite(pct)) expect(parseFloat($b[0].style.width)).to.be.closeTo(pct, 0.01);
            expect($b).to.have.attr('aria-valuemin', '0');
            expect($b).to.have.attr('aria-valuemax', '100');
          });
      });
    });
  });

  it('cycles a column sort asc → desc → default and the API honours it', () => {
    const col = 'totalProjectCost';
    cy.then(() => {
      const label = first.columns.find((c) => c.key === col)!.label;
      headerCell(label).find('div.d-flex').click();
      waitFor('@projects', (i) => paramsOf(i.request.url).get('sortBy') === col).then((i: any) => {
        const p = paramsOf(i.request.url);
        expect(p.getAll('sortBy')).to.deep.eq([col]);
        expect(p.getAll('order')).to.deep.eq(['1']);
        expect(p.get('skip')).to.eq('0');
        const vals = i.response.body.data.map((r: any) => r[col]);
        expect(vals, 'ascending').to.deep.eq([...vals].sort((a: number, b: number) => a - b));
        assertTable(i.response.body);
      });
      headerCell(label).find('i.fa').should('have.class', 'fa-sort-asc');

      headerCell(label).find('div.d-flex').click();
      waitFor('@projects', (i) => paramsOf(i.request.url).get('order') === '-1').then((i: any) => {
        expect(paramsOf(i.request.url).getAll('sortBy')).to.deep.eq([col]);
        const vals = i.response.body.data.map((r: any) => r[col]);
        expect(vals, 'descending').to.deep.eq([...vals].sort((a: number, b: number) => b - a));
        assertTable(i.response.body);
      });
      headerCell(label).find('i.fa').should('have.class', 'fa-sort-desc');

      headerCell(label).find('div.d-flex').click();
      waitFor('@projects', (i) => paramsOf(i.request.url).getAll('sortBy').length === 2).then((i: any) => {
        expect(paramsOf(i.request.url).getAll('sortBy')).to.deep.eq(['stateName', 'ulbName']);
      });
      headerCell(label).find('i.fa').should('have.class', 'fa-sort').and('not.have.class', 'fa-sort-asc');
    });
  });

  it('searches by State on Enter and shows only matching rows', () => {
    cy.then(() => {
      const state = first.data[0]?.stateName;
      if (!state) return cy.log('No rows on staging');
      const label = first.columns.find((c) => c.key === 'stateName')!.label;
      headerCell(label).find('input').type(`${state}{enter}`);
      waitFor('@projects', (i) => paramsOf(i.request.url).get('stateName') === state).then((i: any) => {
        expect(paramsOf(i.request.url).get('skip')).to.eq('0');
        const body: ProjectsResponse = i.response.body;
        expect(body.data.length).to.be.greaterThan(0);
        body.data.forEach((r) => expect(r.stateName.toLowerCase()).to.contain(state.toLowerCase()));
        assertTable(body);
        cy.get('.mat-paginator-range-label').should('contain', `of ${body.total}`);
      });
    });
  });

  it('searches by City on blur', () => {
    cy.then(() => {
      const ulb: string = first.data[0]?.ulbName;
      if (!ulb) return cy.log('No rows on staging');
      const q = ulb.split(' ')[0];
      const label = first.columns.find((c) => c.key === 'ulbName')!.label;
      headerCell(label).find('input').type(q).blur();
      waitFor('@projects', (i) => paramsOf(i.request.url).get('ulbName') === q).then((i: any) => {
        const body: ProjectsResponse = i.response.body;
        expect(body.data.length).to.be.greaterThan(0);
        body.data.forEach((r) => expect(r.ulbName.toLowerCase()).to.contain(q.toLowerCase()));
        assertTable(body);
      });
    });
  });

  it('shows "No data found" for a search with no matches (negative)', () => {
    cy.then(() => {
      const label = first.columns.find((c) => c.key === 'ulbName')!.label;
      headerCell(label).find('input').type('zzqx-no-such-city{enter}');
      waitFor('@projects', (i) => paramsOf(i.request.url).get('ulbName') === 'zzqx-no-such-city').then((i: any) => {
        expect(i.response.body.data).to.have.length(0);
        expect(i.response.body.total).to.eq(0);
      });
      cy.contains('h2', 'No data found').should('be.visible');
      cy.get('table tbody').should('not.exist');
      cy.get('.mat-paginator-range-label').invoke('text').should('match', /0 of 0/);
    });
  });

  it('Reset filters clears searches and sorting and reloads the default list', () => {
    cy.then(() => {
      const stateLabel = first.columns.find((c) => c.key === 'stateName')!.label;
      const costLabel = first.columns.find((c) => c.key === 'totalProjectCost')!.label;
      headerCell(stateLabel).find('input').type('zzqx{enter}');
      waitFor('@projects', (i) => paramsOf(i.request.url).get('stateName') === 'zzqx');
      cy.contains('h2', 'No data found').should('be.visible');
      cy.contains('button', 'Reset filters').click();
      waitFor('@projects', (i) => !paramsOf(i.request.url).has('stateName')).then((i: any) => {
        const p = paramsOf(i.request.url);
        expect(p.getAll('sortBy')).to.deep.eq(['stateName', 'ulbName']);
        expect(p.get('skip')).to.eq('0');
        assertTable(i.response.body);
      });
      headerCell(stateLabel).find('input').should('have.value', '');
      headerCell(costLabel).find('i.fa').should('have.class', 'fa-sort');
    });
  });

  it('paginates forward/back and keeps the active search in the query', () => {
    cy.then(() => {
      if (first.total <= 10) return cy.log('Only one page on staging');
      cy.get('button.mat-paginator-navigation-previous').should('be.disabled');
      cy.get('button.mat-paginator-navigation-next').click();
      waitFor('@projects', (i) => paramsOf(i.request.url).get('skip') === '10').then((i: any) => {
        expect(paramsOf(i.request.url).get('limit')).to.eq('10');
        assertTable(i.response.body);
        const upto = Math.min(20, i.response.body.total);
        cy.get('.mat-paginator-range-label').invoke('text').should('match', new RegExp(`11\\s–\\s${upto}\\s`));
      });
      cy.get('button.mat-paginator-navigation-previous').should('not.be.disabled').click();
      waitFor('@projects', (i) => paramsOf(i.request.url).get('skip') === '0').then((i: any) => assertTable(i.response.body));
    });
  });

  it('changes the page size to each option and requests that limit', () => {
    cy.get('mat-paginator mat-select').click();
    cy.get('mat-option').then(($o) => {
      expect([...$o].map((o) => o.innerText.trim())).to.deep.eq(['10', '20', '50', '100']);
    });
    cy.contains('mat-option', /^\s*20\s*$/).click();
    waitFor('@projects', (i) => paramsOf(i.request.url).get('limit') === '20').then((i: any) => {
      expect(paramsOf(i.request.url).get('skip')).to.eq('0');
      expect(i.response.body.data.length).to.eq(Math.min(20, i.response.body.total));
      assertTable(i.response.body);
    });
    cy.get('mat-paginator .mat-select-value').should('contain', '20');
  });

  it('shows an error alert when the projects API fails (negative)', () => {
    cy.intercept('GET', PROJECTS, { statusCode: 500, body: { message: 'boom' } }).as('projectsFail');
    cy.get('button.mat-paginator-navigation-next').click();
    cy.wait('@projectsFail');
    cy.get('.swal-modal', { timeout: 15000 }).should('be.visible').within(() => {
      cy.get('.swal-title').should('have.text', 'Error');
      cy.get('.swal-text').should('contain', 'Http failure response').and('contain', '500');
    });
    cy.get('.swal-button').click();
    cy.get('.swal-modal').should('not.be.visible');
  });

  it('works on a mobile viewport (table + search)', () => {
    cy.viewport('iphone-x');
    cy.contains('h1', 'Ongoing Infrastructure Projects').should('be.visible');
    cy.get('table tbody tr').should('have.length', first.data.length);
    cy.then(() => {
      const label = first.columns.find((c) => c.key === 'stateName')!.label;
      headerCell(label).find('input').scrollIntoView().type('zzqx{enter}', { force: true });
      waitFor('@projects', (i) => paramsOf(i.request.url).get('stateName') === 'zzqx');
      cy.contains('h2', 'No data found').should('be.visible');
    });
  });
});

describe('Public | Municipal Bonds — navigation', () => {
  it('is reachable from the navbar Dashboard menu on staging', () => {
    cy.visit('/v1/home');
    cy.get('a.nav-link.dropdown-toggle').contains('Dashboard').click();
    cy.contains('a.dropdown-item', 'Municipal Bonds').should('be.visible').click();
    cy.location('pathname').should('eq', '/v1/municipal-bonds');
    cy.contains('h1', 'Ongoing Infrastructure Projects').should('be.visible');
  });
});
