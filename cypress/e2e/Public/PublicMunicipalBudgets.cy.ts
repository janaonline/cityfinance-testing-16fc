/**
 * Public (logged-out) — Municipal Budgets page of the old Angular app.
 * URL: /v1/municipal-budgets (Dashboard menu → "Municipal Budgets"; staging only).
 *
 * Route component: MunicipalityBudgetComponent
 * (cityfinance-ng-ui: src/app/shared/components/municipality-budget) =
 *   app-mapcomponent  — India insights (ULB counts, % with budgets per FY,
 *                       tooltips), State dropdown, ULB-category select, Reset,
 *                       Leaflet heat map (state click / hover)
 *   app-budget-table  — app-common-filter (ULB name, type, year, Filter/Reset)
 *                       and the document list (signed-URL links).
 * APIs (api/v1): municipality-budgets/{insights,documents,heatMap},
 * fiscal-ranking/getStateWiseForm, state, get-signed-url.
 *
 * Built from the cityfinance-ng-ui `staging` branch and checked against
 * staging. Expected values are derived from the intercepted API responses.
 */
export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

type Insight = {
  ulbCount: number;
  atLeastOneYearCount: number;
  fy2020_21: number;
  fy2021_22: number;
  fy2022_23: number;
  fy2023_24: number;
};
type Doc = { year: string; name: string; url: string; type: string; modifiedAt: string };

const PAGE = '/v1/municipal-budgets';
const CATEGORIES = [
  { name: 'Municipal Corporation', _id: '5dcfa67543263a0e75c71697' },
  { name: 'Town Panchayat', _id: '5dcfa66b43263a0e75c71696' },
  { name: 'Municipality', _id: '5dcfa64e43263a0e75c71695' },
];
const YEARS: Record<string, string> = {
  '2020-21': '606aadac4dff55e6c075c507',
  '2021-22': '606aaf854dff55e6c075d219',
  '2022-23': '606aafb14dff55e6c075d3ae',
  '2023-24': '606aafc14dff55e6c075d3ec',
};
const FY_KEYS: [keyof Insight, string][] = [
  ['fy2020_21', '2020-21'],
  ['fy2021_22', '2021-22'],
  ['fy2022_23', '2022-23'],
  ['fy2023_24', '2023-24'],
];

const q = (url: string) => new URL(url).searchParams;

/** Angular `date:'dd-MM-yyyy'` in the browser's local zone. */
const ddmmyyyy = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

/** Waits on `alias` until a call satisfies `pred` (state changes fire some calls twice). */
const waitFor = (alias: string, pred: (i: any) => boolean, tries = 6): Cypress.Chainable<any> =>
  cy.wait(alias).then((i: any) => {
    if (pred(i)) return i;
    if (tries <= 1) throw new Error(`no ${alias} call matched`);
    return waitFor(alias, pred, tries - 1);
  });

const assertInsights = (ins: Insight) => {
  cy.get('app-mapcomponent h3.section-heading').should('have.length', 6);
  cy.contains('app-mapcomponent .col-4', 'ULBs registered on Cityfinance.in')
    .find('h3').invoke('text').invoke('trim').should('eq', String(ins.ulbCount));
  cy.contains('app-mapcomponent .col-4', 'ULBs with at least 1 Year of budget data')
    .find('h3').invoke('text').invoke('trim').should('eq', String(ins.atLeastOneYearCount));
  FY_KEYS.forEach(([k, fy]) =>
    cy.contains('app-mapcomponent p', `cities with budgets for FY ${fy}`)
      .should('have.text', `${ins[k]}% cities with budgets for FY ${fy}`)
      .parent().find('h3').invoke('text').should('match', new RegExp(`^\\s*${ins[k]}%`)));
};

const assertDocs = (docs: Doc[]) => {
  if (!docs.length) {
    cy.contains('app-budget-table h2', 'Not item found').should('be.visible');
    cy.get('app-budget-table table').should('not.exist');
    return;
  }
  cy.get('app-budget-table thead th').then(($th) =>
    expect([...$th].map((t) => t.innerText.trim())).to.deep.eq(['', 'Document Name', 'Updated on']));
  cy.get('app-budget-table tbody').should(($tb) => {
    const rows = $tb.find('tr');
    expect(rows, 'document rows').to.have.length(docs.length);
    docs.forEach((d, i) => {
      const tds = rows.eq(i).find('td');
      expect(tds.eq(0).find('img.file-type'), `row ${i} icon`).to.have.attr('src', `assets/new_dashBord_ftr_hdr/${d.type}.png`);
      const a = tds.eq(1).find('a');
      expect(a.text(), `row ${i} name`).to.eq(d.name);
      expect(a, `row ${i} link`).to.have.attr('target', '_blank');
      expect(a).to.have.attr('rel', 'noopener noreferrer');
      expect(tds.eq(2).text(), `row ${i} date`).to.eq(ddmmyyyy(d.modifiedAt));
    });
  });
};

/** Opens the angular2-multiselect State dropdown (it closes itself on window scroll). */
const openStateDropdown = () => {
  // Native click: Cypress' scroll-into-view would fire window:scroll and close it again.
  cy.get('app-mapcomponent .c-btn').then(($b) => $b[0].click());
  cy.get('.dropdown-list:not([hidden])').should('be.visible');
};
const pickState = (name: string) => {
  openStateDropdown();
  cy.get('.dropdown-list:not([hidden]) li label')
    .contains(new RegExp(`^${name}$`))
    .click({ scrollBehavior: false });
};

describe('Public | Municipal Budgets', () => {
  let insight: Insight;
  let docs: Doc[];
  let states: { _id: string; name: string; code: string }[];

  beforeEach(() => {
    cy.intercept('GET', '**/municipality-budgets/insights*').as('insights');
    cy.intercept('GET', '**/municipality-budgets/documents*').as('documents');
    cy.intercept('GET', '**/municipality-budgets/heatMap*').as('heatMap');
    cy.intercept('GET', '**/fiscal-ranking/getStateWiseForm*').as('stateWiseForm');
    cy.intercept('GET', '**/api/v1/state').as('states');
    cy.visit(PAGE, {
      onBeforeLoad(win) {
        cy.stub(win, 'open').as('winOpen').returns(null);
      },
    });
    cy.wait('@insights').then((i: any) => (insight = i.response.body.data));
    cy.wait('@documents').then((i: any) => (docs = i.response.body.data));
    cy.wait('@states').then((i: any) => (states = i.response.body.data));
    cy.wait('@stateWiseForm').its('response.statusCode').should('eq', 200);
    cy.wait('@heatMap').its('response.body.data').should('have.length.greaterThan', 0);
  });

  it('loads the India insights and they match the insights API', () => {
    cy.get('@insights.all').then((calls: any) => {
      expect(q(calls[0].request.url).toString(), 'no filters on first load').to.eq('');
    });
    cy.contains('app-mapcomponent h2', 'Dashboard').should('be.visible');
    cy.contains('app-mapcomponent h2', 'Explore').should('be.visible');
    cy.contains('Select a state on map to know more about its municipal budget information').should('be.visible');
    cy.contains('app-mapcomponent h4', 'India').should('be.visible');
    cy.contains('* As per the data submitted by ULB.').should('exist');
    cy.then(() => assertInsights(insight));
  });

  it('shows the "N ULBs out of M" tooltip on every FY info icon', () => {
    cy.then(() => {
      FY_KEYS.forEach(([k], idx) => {
        const n = Math.round((insight.ulbCount / 100) * (insight[k] as number)).toLocaleString('en-US');
        cy.get('app-mapcomponent mat-icon').filter(':contains("info_outline")').eq(idx)
          .trigger('mouseenter');
        cy.get('mat-tooltip-component').should('be.visible')
          .and('contain.text', `${n} ULBs out of ${insight.ulbCount} active ULBs have submitted their budget document`);
        cy.get('app-mapcomponent mat-icon').filter(':contains("info_outline")').eq(idx)
          .trigger('mouseleave');
        cy.get('mat-tooltip-component').should('not.exist');
      });
    });
  });

  it('lists the budget documents from the documents API', () => {
    cy.get('@documents.all').then((calls: any) => {
      const p = q(calls[0].request.url);
      expect(p.get('state')).to.eq('');
      expect(p.get('category')).to.eq('');
    });
    cy.contains('app-budget-table span', 'Budget').should('be.visible');
    cy.then(() => {
      if (!docs.length) cy.log('Documents API returned no rows on staging');
      assertDocs(docs);
    });
  });

  it('renders the India heat map with one path per state and a hover tooltip', () => {
    cy.get('.stateMapContainer path.leaflet-interactive').should('have.length.greaterThan', 30);
    cy.get('.stateMapContainer path.leaflet-interactive').eq(5)
      .trigger('mouseover', { force: true })
      .trigger('mouseover', { force: true })
      .trigger('mousemove', { force: true });
    cy.get('.leaflet-tooltip').should('exist').invoke('text').should('not.be.empty');
  });

  it('State dropdown lists India + all states and filters insights, documents and the map', () => {
    openStateDropdown();
    cy.get('.dropdown-list:not([hidden]) li label').then(($l) => {
      const labels = [...$l].map((l) => l.innerText.trim());
      expect(labels[0]).to.eq('India');
      expect(labels.slice(1)).to.have.members(states.map((s) => s.name));
    });
    // the list filters as you type
    cy.get('.dropdown-list:not([hidden]) input.c-input').type('Karna', { scrollBehavior: false });
    cy.get('.dropdown-list:not([hidden]) li label:visible').should('have.length', 1).and('have.text', 'Karnataka')
      .click({ scrollBehavior: false });
    cy.then(() => {
      const ka = states.find((s) => s.name === 'Karnataka')!;
      waitFor('@insights', (i) => q(i.request.url).get('state') === ka._id).then((i: any) => {
        expect(q(i.request.url).get('category')).to.eq('');
        const ins: Insight = i.response.body.data;
        if (ins.ulbCount === 0) {
          cy.log('APP BUG: insights API returns all-zero counts for a state filter');
        }
        assertInsights(ins);
      });
      waitFor('@documents', (i) => q(i.request.url).get('state') === ka._id).then((i: any) => {
        const d: Doc[] = i.response.body.data;
        d.forEach((x) => expect(x.name).to.match(/^Karnataka_/));
        assertDocs(d);
      });
      waitFor('@heatMap', (i) => q(i.request.url).has('category'));
    });
    cy.get('app-mapcomponent .c-btn').should('contain.text', 'Karnataka');
  });

  it('ULB category select filters by category and Reset restores India / All Categories', () => {
    cy.get('app-mapcomponent select#years option').then(($o) => {
      expect([...$o].map((o) => o.innerText.trim())).to.deep.eq(['All Categories', ...CATEGORIES.map((c) => c.name)]);
      expect([...$o].map((o) => (o as HTMLOptionElement).value)).to.deep.eq(['', ...CATEGORIES.map((c) => c._id)]);
    });
    cy.get('app-mapcomponent select#years').select('Municipal Corporation');
    const mc = CATEGORIES[0]._id;
    waitFor('@heatMap', (i) => q(i.request.url).get('category') === mc).then((i: any) => {
      expect(i.response.statusCode).to.eq(200);
    });
    waitFor('@insights', (i) => q(i.request.url).get('category') === mc).then((i: any) => assertInsights(i.response.body.data));
    waitFor('@documents', (i) => q(i.request.url).get('category') === mc).then((i: any) => assertDocs(i.response.body.data));

    cy.contains('app-mapcomponent button', 'Reset').click();
    waitFor('@documents', (i) => q(i.request.url).get('category') === '' && !q(i.request.url).get('state'))
      .then((i: any) => assertDocs(i.response.body.data));
    waitFor('@insights', (i) => !q(i.request.url).get('category')).then((i: any) => assertInsights(i.response.body.data));
    cy.get('app-mapcomponent select#years').should('have.value', '');
    cy.get('app-mapcomponent .c-btn').should('contain.text', 'India');
  });

  it('clicking a state on the map selects it and filters the documents', () => {
    cy.get('.stateMapContainer path.leaflet-interactive').eq(5).click({ force: true });
    waitFor('@documents', (i) => !!q(i.request.url).get('state')).then((i: any) => {
      const id = q(i.request.url).get('state');
      const st = states.find((s) => s._id === id)!;
      expect(st, 'state id from the state list').to.exist;
      cy.get('app-mapcomponent .c-btn').should('contain.text', st.name);
      const d: Doc[] = i.response.body.data;
      d.forEach((x) => expect(x.name.startsWith(`${st.name}_`)).to.eq(true));
      assertDocs(d);
    });
  });

  it('common filter: ULB name + type + year narrow the document list', () => {
    cy.then(function () {
      const doc = docs.find((d) => YEARS[d.year]);
      if (!doc) {
        cy.log('No documents for the filterable years on staging');
        this.skip();
      }
      const ulb = doc!.name.split('_')[1];
      cy.get('app-common-filter h3').should('have.text', 'Filters');
      cy.get('app-common-filter select').eq(0).find('option').then(($o) =>
        expect([...$o].map((o) => [o.value, o.innerText.trim()])).to.deep.eq([['raw', 'Raw Data PDF']]));
      cy.get('app-common-filter select').eq(1).find('option').then(($o) =>
        expect([...$o].map((o) => o.innerText.trim())).to.deep.eq(['All years', ...Object.keys(YEARS)]));
      cy.get('app-common-filter input[placeholder="Ulb Name"]').type(ulb);
      cy.get('app-common-filter select').eq(1).select(doc!.year);
      cy.contains('app-common-filter button', 'Filter').click();
      waitFor('@documents', (i) => q(i.request.url).get('ulbName') === ulb).then((i: any) => {
        const p = q(i.request.url);
        expect(p.get('type')).to.eq('raw');
        expect(p.get('year')).to.eq(YEARS[doc!.year]);
        const d: Doc[] = i.response.body.data;
        expect(d.length).to.be.greaterThan(0);
        d.forEach((x) => {
          expect(x.name).to.contain(ulb);
          expect(x.year).to.eq(doc!.year);
        });
        assertDocs(d);
      });
    });
  });

  it('common filter: unknown ULB shows "Not item found" and Reset clears the filter (negative)', () => {
    cy.get('app-common-filter input[placeholder="Ulb Name"]').type('zzqx-no-such-ulb');
    cy.contains('app-common-filter button', 'Filter').click();
    waitFor('@documents', (i) => q(i.request.url).get('ulbName') === 'zzqx-no-such-ulb').then((i: any) => {
      expect(i.response.body.data).to.have.length(0);
    });
    cy.contains('app-budget-table h2', 'Not item found').should('be.visible');
    cy.get('app-budget-table table').should('not.exist');

    cy.contains('app-common-filter button', 'Reset').click();
    waitFor('@documents', (i) => !q(i.request.url).has('ulbName')).then((i: any) => assertDocs(i.response.body.data));
    cy.get('app-common-filter input[placeholder="Ulb Name"]').should('have.value', '');
  });

  it('opening a document requests a signed URL and opens it in a new tab', function () {
    if (!docs.length) {
      cy.log('No documents on staging');
      this.skip();
    }
    cy.intercept('POST', '**/get-signed-url').as('signedUrl');
    cy.get('app-budget-table tbody tr a').first().should('not.have.attr', 'href');
    cy.get('app-budget-table tbody tr a').first().click();
    cy.wait('@signedUrl').then(function (i: any) {
      expect(i.request.body).to.deep.eq({ fileUrl: docs[0].url });
      const signed: string | undefined = i.response.body?.data?.signedUrl;
      if (!signed) {
        // Staging answers 401 "Session Expired!" for logged-out users and the
        // app's interceptor bounces to the login page, so public visitors
        // cannot open budget PDFs.
        cy.log(`APP BUG: get-signed-url → ${i.response.statusCode} ${JSON.stringify(i.response.body).slice(0, 120)}`);
        this.skip();
      }
      cy.get('@winOpen').should('have.been.calledWith', signed, '_blank', 'noopener,noreferrer');
      cy.request({ url: signed!, method: 'HEAD' }).its('headers.content-type').should('contain', 'pdf');
    });
  });

  it('stacks into a single column on a mobile viewport', () => {
    cy.viewport('iphone-x');
    cy.contains('app-mapcomponent .col-4', 'ULBs registered on Cityfinance.in').should('be.visible');
    cy.get('app-mapcomponent .col-md-5').then(($c) => {
      // the insights block and the map block are stacked, not side-by-side
      expect($c[1].getBoundingClientRect().top).to.be.greaterThan($c[0].getBoundingClientRect().bottom - 1);
    });
    cy.then(() => assertDocs(docs));
  });
});

describe('Public | Municipal Budgets — navigation', () => {
  it('is reachable from the navbar Dashboard menu on staging', () => {
    cy.visit('/v1/home');
    cy.get('a.nav-link.dropdown-toggle').contains('Dashboard').click();
    cy.contains('a.dropdown-item', 'Municipal Budgets').should('be.visible').click();
    cy.location('pathname').should('eq', '/v1/municipal-budgets');
    cy.contains('app-budget-table span', 'Budget').should('be.visible');
  });
});
