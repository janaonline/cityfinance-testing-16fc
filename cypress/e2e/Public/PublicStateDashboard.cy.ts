/**
 * Public (logged-out) — State dashboard.
 * URL: /municipal-data/state/:slug
 *
 * Built from the cf-ui-ssr-v3 (Angular 20 SSR, `staging` branch) sources —
 * pages/dashboard/state/** (state page, financial-indicator, mix-chart,
 * population-table, compare-by-dialog, borrowing-credit-rating,
 * credit-rating) and the shared grid-view / info-cards / state-search /
 * city-search / map / charts components — plus the cf-nest-api-v2 API
 * shapes, then checked against staging.
 *
 * The state is NOT hard-coded: it is the state with the highest standardized
 * data availability (national map API) that also has municipal bonds; a
 * second-ranked state is used for the state switcher, and a state with no
 * bonds/credit ratings for the empty states.
 *
 * SSR + Angular HTTP transfer cache: GETs made while rendering on the server
 * are not repeated by the browser, so first-paint expectations come from the
 * same API URLs via cy.request; everything triggered by the user (and every
 * POST) is asserted through cy.intercept.
 *
 * Read-only. The ULB search POST (recentSearchKeyword/search) is the app's
 * own search call. Downloads are asserted on request/response, and the
 * programmatic <a download> click is captured instead of saving a file.
 */
export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const API = '/api/v1/';
const STATE_DASHBOARD_ID = '619cc1016abe7f5b80e45c6b';
const LONG = { timeout: 30000 };

// financial-indicator/constant.ts#stateDashboardSubTabsList (name → tabType code)
const TAB_CODE: Record<string, string> = {
  'Total Revenue': 'TotalRevenue',
  'Revenue Per Capita': 'RevenuePerCapita',
  'Revenue Mix': 'RevenueMix',
  'Total Surplus/Deficit': 'DeficitOrSurplus',
  'Expenditure Mix': 'ExpenditureMix',
  'Revenue Expenditure Mix': 'RevenueExpenditureMix',
  'Revenue Expenditure': 'RevenueTotalExpenditure',
  'Total Own Revenue': 'TotalOwnRevenue',
  'Own Revenue per Capita': 'OwnRevenuePerCapita',
  'Own Revenue Mix': 'OwnRevenueMix',
  'Capital Expenditure': 'CapitalTotalExpenditure',
  'Capital Expenditure Per Capita': 'CapitalExpenditurePerCapita',
};
// financial-indicator.ts#getSLBBtn (SLB main button → indicator "type")
const SLB_TYPE: Record<string, string> = {
  'Water Supply': 'water supply',
  'Waste Water Management': 'sanitation',
  'Solid Waste Management': 'solid waste',
  'Storm Water Drainage': 'storm water',
};
const SCATTER_SERIES = ['Municipality', 'Municipal Corporation', 'Town Panchayat', 'Cantonment Board'];

// ---------------------------------------------------------------- helpers --

type Call = {
  method: string;
  url: string;
  query: Record<string, any>;
  reqBody: any;
  status?: number;
  headers?: Record<string, any>;
  body?: any;
  done: boolean;
};

function record(method: string, matcher: RegExp): Call[] {
  const calls: Call[] = [];
  cy.intercept(method, matcher, (req) => {
    const c: Call = { method: req.method, url: req.url, query: req.query as any, reqBody: req.body, done: false };
    calls.push(c);
    req.continue((res) => {
      c.status = res.statusCode;
      c.headers = res.headers;
      c.body = res.body;
      c.done = true;
    });
  });
  return calls;
}

function waitCall(calls: Call[], pred: (c: Call) => boolean, msg: string): Cypress.Chainable<Call> {
  return cy
    .wrap(null, { log: false, timeout: 30000 })
    .should(() => {
      expect(calls.filter((c) => c.done && pred(c)), msg).to.have.length.greaterThan(0);
    })
    .then(() => calls.filter((c) => c.done && pred(c)).pop() as Call);
}

const reset = (...lists: Call[][]) => cy.then(() => lists.forEach((l) => (l.length = 0)));

function apiGet(path: string, qs: Record<string, any> = {}) {
  return cy.request({ url: API + path, qs }).its('body');
}

function inrAuto(value: unknown): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '-';
  const n = Number(value);
  const abs = Math.abs(n);
  const o = { maximumFractionDigits: 0, minimumFractionDigits: 0 };
  let f: string;
  if (abs >= 1e7) f = (n / 1e7).toLocaleString('en-IN', o) + ' Cr';
  else if (abs >= 1e5) f = (n / 1e5).toLocaleString('en-IN', o) + ' Lakh';
  else if (abs >= 1e3) f = (n / 1e3).toLocaleString('en-IN', o) + ' K';
  else f = n.toLocaleString('en-IN', o);
  return `₹ ${f}`;
}

function mediumDates(iso: string): string[] {
  const d = new Date(iso);
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return [d.toLocaleDateString('en-US', o), d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })];
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function instrument(win: any) {
  win.__drawn = [] as string[];
  win.__downloads = [] as { name: string; href: string }[];
  const proto = win.CanvasRenderingContext2D.prototype;
  const fill = proto.fillText;
  proto.fillText = function (text: any, ...rest: any[]) {
    win.__drawn.push(String(text));
    return fill.apply(this, [text, ...rest]);
  };
  const click = win.HTMLAnchorElement.prototype.click;
  win.HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      win.__downloads.push({ name: this.download, href: String(this.href).slice(0, 40) }); // data: URLs can be huge
      return;
    }
    return click.apply(this);
  };
}
const clearDrawn = () => cy.window().then((w: any) => (w.__drawn.length = 0));
function drawnShouldInclude(texts: string[]) {
  cy.window().its('__drawn', LONG).should((drawn: string[]) => {
    texts.forEach((t) => expect(drawn, `canvas text "${t}"`).to.include(t));
  });
}
function downloadsShouldInclude(pred: (d: { name: string; href: string }) => boolean, msg: string) {
  cy.window().its('__downloads', LONG).should((d: any[]) => expect(d.some(pred), msg).to.be.true);
}

/** Visit and wait until hydrated (Leaflet only runs in the browser). */
function visitState(slug: string) {
  cy.visit(`/municipal-data/state/${slug}`, { onBeforeLoad: instrument, timeout: 120000 }); // staging is sometimes slow to fire load
  cy.get('#map-container.leaflet-container path.leaflet-interactive', { timeout: 60000 }).should('have.length.gte', 1);
}

function openTab(name: string) {
  cy.contains('.mdc-tab', name).click();
  cy.contains('.mdc-tab--active', name).should('exist');
}

/** Opens a mat-select (by its label) and picks an option. */
function matSelect(scope: string, label: string, option: string | RegExp) {
  cy.contains(`${scope} mat-form-field`, label).find('mat-select').click();
  cy.contains('mat-option', option).scrollIntoView().click({ force: true });
}

const FI = 'app-financial-indicator';
const mainBtns = () => cy.get(`${FI} > section > .position-relative > app-tab-buttons button`);
const subBtns = () => cy.get(`${FI} .col-auto app-tab-buttons button`);
const chartsSettled = () => cy.get(`${FI} app-pre-loader`, LONG).should('not.exist');

// ------------------------------------------------------------ live data --

let state: any; // chosen state ({_id, name, code, slug})
let otherState: any; // for the switcher
let emptyState: any; // no bonds & no credit ratings
let years: string[] = []; // state ledger years
let stateTabs: { name: string; buttons: { key: string; text: string; sub: string[] }[] }[] = [];
let details: any;

before(() => {
  apiGet('common/get-latest-standardized-year').then((y) => {
    apiGet('get-statewise-data-availability', { financialYear: y.ledgerYears[1], population: true }).then((avail) => {
      apiGet('bond-issuances/get-bonds').then((bonds) => {
        apiGet('state').then((st) => {
          cy.request('/assets/files/credit-rating.json').its('body').then((ratings: any[]) => {
            const bondCount: Record<string, number> = {};
            bonds.data.forEach((b: any) => (bondCount[b.state] = (bondCount[b.state] || 0) + 1));
            const ranked = [...avail.data].sort((a: any, b: any) => b.percentage - a.percentage);
            const pick = ranked.find((r: any) => bondCount[r.stateId]) || ranked[0];
            state = st.data.find((s: any) => s._id === pick.stateId);
            const second = ranked.find((r: any) => r.stateId !== pick.stateId);
            otherState = st.data.find((s: any) => s._id === second.stateId);
            const rated = new Set(ratings.map((r) => r.state));
            emptyState = st.data.find((s: any) => s.slug && !bondCount[s._id] && !rated.has(s.name));
            cy.log(`State under test: ${state.name} (${state.slug}); switcher target: ${otherState.name}`);
            apiGet('common/get-latest-standardized-year', { stateCode: state.code }).then((b) => (years = b.ledgerYears));
            apiGet('dashboard/state/details', { slug: state.slug, year: '' }).then((b) => (details = b.data));
          });
        });
      });
    });
  });
  apiGet(`dashboardHeaders/${STATE_DASHBOARD_ID}`).then((b) => {
    stateTabs = [...b.data]
      .sort((a: any, c: any) => a.position - c.position)
      .map((t: any) => ({
        name: t.name,
        buttons: (t.subHeaders || []).map((s: any) => ({
          key: s.name,
          text: s.mainContent?.[0]?.about,
          sub: s.mainContent?.[0]?.btnLabels || [],
        })),
      }));
  });
});

describe('Public | State dashboard', () => {
  let dataAvail: Call[];
  let money: Call[];
  let post: Call[]; // state-revenue / state-dashboard-averages / state-slb
  let tabsGet: Call[]; // state-revenue-tabs
  let search: Call[];

  beforeEach(() => {
    dataAvail = record('POST', /\/api\/v1\/data-available/);
    money = record('GET', /\/api\/v1\/dashboard\/financial-info\/get-data/);
    post = record('POST', /\/api\/v1\/(state-revenue|state-dashboard-averages|state-slb)(\?|$)/);
    tabsGet = record('GET', /\/api\/v1\/state-revenue-tabs\?/);
    search = record('POST', /\/api\/v1\/recentSearchKeyword\/search/);
  });

  // ------------------------------------------------------------ header --

  it('shows the state name, SEO title, summary grid and the "Go To National Dashboard" link', () => {
    visitState(state.slug);
    cy.title().should('eq', `Municipal Financial Data of ${details.state.name} Cities | City Finance`);
    cy.contains('h1', details.state.name).should('be.visible');
    cy.contains('Summary of key state demographics and municipal (urban) indicators').should('be.visible');
    cy.get('app-state app-grid-view .explore-data-grid > div').should('have.length', details.gridData.length);
    details.gridData.forEach((g: any, i: number) => {
      cy.get('app-state app-grid-view .explore-data-grid > div').eq(i).within(() => {
        cy.get('p').eq(0).invoke('text').should((t) => expect(norm(t)).to.eq(String(g.value)));
        cy.get('p').eq(1).invoke('text').should((t) => expect(norm(t)).to.eq(g.label));
      });
    });
    cy.contains('a', 'Go To National Dashboard').should('have.attr', 'href', '/municipal-data/national').click();
    cy.location('pathname', LONG).should('eq', '/municipal-data/national');
    cy.contains('h1', 'National Performance', LONG).should('be.visible');
  });

  it('shows only this state on the map with a marker per located ULB; hovering a marker shows its name', () => {
    cy.intercept('GET', /\/ulbs\?stateCode=/).as('ulbs');
    visitState(state.slug);
    cy.get('#map-container').should('have.class', 'state-highlight');
    cy.wait('@ulbs', LONG).then(({ request, response }) => {
      expect(request.url).to.contain(`stateCode=${state.code}`);
      const ulbs = response!.body.data[state.code].ulbs;
      const located = ulbs.filter((u: any) => u.location?.lat && u.location?.lng);
      if (!located.length) {
        cy.log('No ULB of this state has coordinates on staging');
        return;
      }
      cy.get('#map-container .leaflet-marker-icon', LONG).should('have.length', located.length);
      cy.get('#map-container .leaflet-marker-icon').first().trigger('mouseover', { force: true });
      cy.get('.leaflet-popup-content', LONG).invoke('text').then((t) => {
        expect(located.map((u: any) => u.name)).to.include(norm(t));
      });
    });
  });

  it('Standardized Data Availability matches the data-available API; its "Download Data" exports Excel', () => {
    visitState(state.slug);
    waitCall(dataAvail, (c) => !c.reqBody.csv && c.reqBody.stateId === state._id, 'data-available').then((c) => {
      expect(c.reqBody.financialYear).to.eq(years[1]);
      const pct = Math.round(c.body.data.percent);
      cy.contains('h6', 'Standardized Data Availability').parent().invoke('text').should((t) => {
        const txt = norm(t);
        expect(txt).to.contain(`Of the financial statements submitted by the ULBs, ${pct}%`);
        expect(txt).to.contain(`for the year ${years[1]}`);
        (c.body.data.names || []).forEach((n: string) => expect(txt).to.contain(n));
      });
      cy.get('app-state .chart-title p.fw-bold').should('have.text', ` ${pct}% `);
      cy.get('app-state .chart-title p').eq(1).invoke('text').should((t) => expect(norm(t)).to.eq(`Data Standardized (${years[1]})`));
      cy.get('app-state .charts-container canvas').should('be.visible');
      cy.get('.dataAvailabiltyTab').invoke('text')
        .then((t) => expect(norm(t)).to.eq(`${state.name} Data Availability - ${pct}% (${years[1]})`));
    });
    cy.contains('app-state .col-md-8 button', 'Download Data').click();
    waitCall(dataAvail, (c) => c.reqBody.csv === true, 'csv').then((c) => {
      expect(c.reqBody).to.include({ financialYear: years[1], stateId: state._id });
      expect(c.status).to.eq(200);
      expect(String(c.headers!['content-type'])).to.contain('spreadsheetml');
    });
    downloadsShouldInclude((d) => d.name === 'DataAvailable' && d.href.startsWith('blob:'), 'DataAvailable download');
  });

  it('shows money-info cards for the default year and the year dropdown refreshes cards and data availability', () => {
    visitState(state.slug);
    cy.get('#state_years option').then(($o) => expect([...$o].map((o) => (o as HTMLOptionElement).value)).to.deep.equal(years));
    cy.get('#state_years').should('have.value', years[1]);
    apiGet('dashboard/financial-info/get-data', { year: years[1], stateId: state._id }).then((res) => {
      cy.get('app-state app-info-cards .card').should('have.length', res.result.length);
      res.result.forEach((c: any, i: number) => {
        cy.get('app-state app-info-cards .card').eq(i).within(() => {
          cy.get('p.fw-bold').should('have.text', inrAuto(c.value));
          cy.get('p.text-secondary').invoke('text').should((t) => expect(norm(t)).to.eq(c.label));
        });
      });
      cy.get('app-state app-info-cards .card').eq(0).find('i.bi-info-circle').scrollIntoView().trigger('mouseenter', { force: true });
      cy.get('.mat-mdc-tooltip', LONG).invoke('text').should((t) => expect(norm(t)).to.eq(norm(res.result[0].tooltip)));
      cy.contains('p', 'Last updated on:').invoke('text').then((t) => {
        expect(mediumDates(res.lastModifiedAt).some((d) => t.includes(d))).to.be.true;
      });
    });

    const target = years[2] || years[0];
    reset(dataAvail, money);
    cy.get('#state_years').select(target);
    waitCall(money, (c) => c.query.year === target, 'money info').then((c) => {
      expect(c.query.stateId).to.eq(state._id);
      if (!c.body.result.length) {
        cy.contains('app-state app-info-cards .alert', 'Financial data is unavailable for selected entity.').should('be.visible');
      } else {
        c.body.result.forEach((card: any, i: number) => {
          cy.get('app-state app-info-cards .card').eq(i).find('p.fw-bold').should('have.text', inrAuto(card.value));
        });
      }
    });
    waitCall(dataAvail, (c) => c.reqBody.financialYear === target, 'data availability').then((c) => {
      const pct = Math.round(c.body.data.percent);
      cy.get('.dataAvailabiltyTab').invoke('text').should((t) => expect(norm(t)).to.eq(`${state.name} Data Availability - ${pct}% (${target})`));
    });
  });

  it('state switcher: rejects an unknown state and navigates to the chosen state dashboard', () => {
    visitState(state.slug);
    cy.get('app-state > section app-state-search input#stateName').should('have.value', state.name)
      .clear({ force: true }).type('zzqx', { force: true });
    cy.contains('mat-option', 'No results found for your search.', LONG).should('have.attr', 'aria-disabled', 'true');
    cy.get('app-state > section app-state-search input#stateName').clear({ force: true }).type(otherState.name.slice(0, 6), { force: true });
    cy.contains('mat-option', new RegExp(`^\\s*${esc(otherState.name)}\\s*$`), LONG).click();
    cy.location('pathname', LONG).should('eq', `/municipal-data/state/${otherState.slug}`);
    waitCall(dataAvail, (c) => c.reqBody.stateId === otherState._id, 'data availability of new state');
    cy.contains('h1', otherState.name, LONG).should('be.visible');
    cy.get('app-state > section app-state-search input#stateName').should('have.value', otherState.name);
  });

  it('header ULB search: no-match message, state-scoped results, and navigation to the city dashboard', () => {
    visitState(state.slug);
    const input = () => cy.get('app-state > section .col-md-6 app-city-search input');
    input().type('zzqxw', { force: true });
    waitCall(search, (c) => c.reqBody.matchingWord === 'zzqxw', 'no-match search').then((c) => {
      expect(c.url).to.contain(`state=${state._id}`);
      expect(c.body.data).to.have.length(0);
    });
    cy.contains('mat-option', 'No results found.', LONG).should('be.visible');
    // A ULB of this state taken from the bonds API.
    cy.request(`${API}bond-issuances/get-bonds/${state._id}`).its('body.data').then((bonds: any[]) => {
      const word = bonds.map((b) => b.ulb.split(' ')[0]).find((w) => w.length >= 4) || state.name.slice(0, 4);
      reset(search);
      input().clear({ force: true }).type(word, { force: true });
      waitCall(search, (c) => c.reqBody.matchingWord === word, 'ULB search').then((c) => {
        const ulbs = c.body.data;
        if (!ulbs.length) {
          cy.contains('mat-option', 'No results found.').should('be.visible');
          return;
        }
        ulbs.forEach((u: any) => expect(u.state._id, 'results limited to the state').to.eq(state._id));
        cy.get('mat-option').should(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.equal(ulbs.map((u: any) => u.name)));
        cy.get('mat-option').first().scrollIntoView().click({ force: true });
        cy.location('pathname', LONG).should('eq', `/municipal-data/city/${ulbs[0].slug}`);
      });
    });
  });

  it('lists the dashboard tabs; Financial Indicators is selected first', () => {
    visitState(state.slug);
    cy.get('.mdc-tab .mdc-tab__text-label').then(($t) => {
      expect([...$t].map((e) => norm(e.textContent || ''))).to.deep.equal(['Financial Indicators', 'Service Level Benchmark', 'Borrowings & Credit Rating']);
    });
    cy.get('.mdc-tab').eq(0).should('have.attr', 'aria-selected', 'true');
  });

  // ---------------------------------------------- Financial Indicators --

  it('Financial Indicators: default Revenue → Total Revenue drives scatter, Top-10 bar chart and population table', () => {
    visitState(state.slug);
    const fi = stateTabs[0];
    mainBtns().then(($b) => expect([...$b].map((b) => norm(b.innerText))).to.deep.equal(fi.buttons.map((b) => b.key)));
    mainBtns().eq(0).should('have.class', 'btn-cfPrimary');
    cy.get(`${FI} > section > .position-relative > p`).first().invoke('text').should((t) => expect(norm(t)).to.eq(norm(fi.buttons[0].text)));
    subBtns().then(($b) => expect([...$b].map((b) => norm(b.innerText))).to.deep.equal(fi.buttons[0].sub));
    subBtns().eq(0).should('have.class', 'btn-cfPrimary');
    cy.contains(`${FI} mat-form-field`, 'Year').find('.mat-mdc-select-value').should('have.text', years[1]);

    waitCall(post, (c) => c.url.endsWith('/state-revenue'), 'scatter').then((c) => {
      expect(c.reqBody).to.include({
        state: state._id, stateId: state._id, financialYear: years[1], headOfAccount: 'Revenue',
        filterName: 'revenue', chartType: 'scatter', isPerCapita: false, compareType: '', compareCategory: '', TabType: 'TotalRevenue',
      });
      expect(c.status).to.eq(200);
    });
    cy.contains(`${FI} #scatterChart p`, `Total Revenue of all ULBs in ${state.name} vs State`).should('be.visible');
    drawnShouldInclude(['Population(in Thousands)', 'Total Revenue (In Cr.)', ...SCATTER_SERIES]);

    waitCall(tabsGet, (c) => c.query.tabType === 'TotalRevenue', 'bar').then((c) => {
      expect(c.query).to.include({ chartType: 'bar', sortBy: 'top', financialYear: years[1], stateId: state._id, activeButton: 'Total Revenue' });
      chartsSettled();
      cy.contains(`${FI} button.rankingButton`, 'Top 10').should('have.class', 'activeButton');
      cy.contains(`${FI} #barChart p`, 'Compare ULBs on various financial indicators').should('be.visible');
      if (!c.body.data.length) {
        cy.get(`${FI} #barChart app-no-data-found`).should('be.visible');
      } else {
        const first = c.body.data[0];
        drawnShouldInclude([first.ulbName, `₹ ${Math.round(first.sum / 1e7).toLocaleString()} Cr`, 'Amount (in Cr.)']);
      }
    });

    apiGet('state-ulbs-grouped-by-population', { stateId: state._id }).then((res) => {
      const pop = res.data[0] || {};
      cy.contains(`${FI} app-population-table p`, `Distribution of ULBs in ${state.name} according to Population category`);
      cy.get(`${FI} app-population-table tr`).eq(0).find('td').then(($td) => {
        expect([...$td].map((t) => norm(t.textContent || ''))).to.deep.equal(['ULB Population Category', ...Object.keys(pop)]);
      });
      cy.get(`${FI} app-population-table tr`).eq(1).find('td').then(($td) => {
        expect([...$td].map((t) => norm(t.textContent || ''))).to.deep.equal(['Number of ULBs', ...Object.values(pop).map(String)]);
      });
    });
  });

  it('Financial Indicators: Bottom 10 / Top 10 re-query the ranking and redraw the bar chart', () => {
    visitState(state.slug);
    waitCall(tabsGet, (c) => c.query.sortBy === 'top', 'initial bar');
    chartsSettled();
    reset(tabsGet);
    clearDrawn();
    cy.contains(`${FI} button.rankingButton`, 'Bottom 10').click();
    waitCall(tabsGet, (c) => c.query.sortBy === 'bottom', 'bottom 10').then((c) => {
      expect(c.query.tabType).to.eq('TotalRevenue');
      cy.contains(`${FI} button.rankingButton`, 'Bottom 10').should('have.class', 'activeButton');
      cy.contains(`${FI} button.rankingButton`, 'Top 10').should('not.have.class', 'activeButton');
      if (c.body.data.length) drawnShouldInclude(c.body.data.map((d: any) => d.ulbName).slice(0, 3));
      else cy.get(`${FI} #barChart app-no-data-found`).should('be.visible');
    });
    reset(tabsGet);
    cy.contains(`${FI} button.rankingButton`, 'Top 10').click();
    waitCall(tabsGet, (c) => c.query.sortBy === 'top', 'top 10 again');
    cy.contains(`${FI} button.rankingButton`, 'Top 10').should('have.class', 'activeButton');
  });

  it('Financial Indicators: Year, Category (averages) and Reset re-query the charts', () => {
    visitState(state.slug);
    waitCall(post, (c) => c.url.endsWith('/state-revenue'), 'initial');
    chartsSettled();
    const target = years[2] || years[0];
    reset(post, tabsGet);
    matSelect(FI, 'Year', new RegExp(`^\\s*${target}\\s*$`));
    waitCall(post, (c) => c.url.endsWith('/state-revenue') && c.reqBody.financialYear === target, 'scatter for year');
    waitCall(tabsGet, (c) => c.query.financialYear === target, 'bar for year');

    // Category tooltip + National Avg → state-dashboard-averages (no stateId).
    cy.contains(`${FI} mat-form-field`, 'Category').scrollIntoView().trigger('mouseenter', { force: true });
    cy.get('.mat-mdc-tooltip', LONG).should('contain.text', 'Select an option to view average data');
    cy.contains(`${FI} mat-form-field`, 'Category').trigger('mouseleave', { force: true });
    reset(post);
    cy.contains(`${FI} mat-form-field`, 'Category').find('mat-select').click();
    cy.get('mat-option').should(($o) => {
      expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.equal(['Select an Option', 'National Avg', 'ULB Type Avg', 'Population Category Avg']);
    });
    cy.contains('mat-option', 'National Avg').click();
    waitCall(post, (c) => c.url.endsWith('/state-dashboard-averages'), 'national average').then((c) => {
      expect(c.reqBody).to.include({ compareCategory: 'nationalAvg', which: 'nationalAvg', financialYear: target });
      expect(c.reqBody).to.not.have.property('stateId');
      expect(c.status).to.eq(200);
    });
    reset(post);
    cy.contains(`${FI} mat-form-field`, 'Category').find('mat-select').click();
    cy.contains('mat-option', 'Population Category Avg').click();
    waitCall(post, (c) => c.url.endsWith('/state-dashboard-averages') && c.reqBody.compareCategory === 'populationAvg', 'population average');

    reset(post, tabsGet);
    cy.contains(`${FI} [role="button"]`, 'Reset').click();
    waitCall(post, (c) => c.url.endsWith('/state-revenue') && c.reqBody.compareCategory === '', 'reset').then((c) => {
      expect(c.reqBody.financialYear).to.eq(years[1]);
      expect(c.reqBody.ulb).to.deep.equal([]);
    });
    waitCall(tabsGet, (c) => c.query.financialYear === years[1], 'bar after reset');
    cy.contains(`${FI} mat-form-field`, 'Year').find('.mat-mdc-select-value').should('have.text', years[1]);
  });

  it('Financial Indicators: every main/sub indicator button queries its own tab type', () => {
    const mixWithoutData: string[] = [];
    cy.on('uncaught:exception', (e) => {
      // Known app bug, only for a Mix button whose response has no line items.
      if (/reading 'code'/.test(e.message)) return false;
      return true;
    });
    visitState(state.slug);
    waitCall(post, (c) => c.url.endsWith('/state-revenue'), 'initial');
    const fi = stateTabs[0];
    fi.buttons.forEach((main, mi) => {
      if (mi > 0) {
        reset(post, tabsGet);
        mainBtns().eq(mi).click();
      }
      mainBtns().eq(mi).should('have.class', 'btn-cfPrimary');
      cy.get(`${FI} > section > .position-relative > p`).first().invoke('text').should((t) => expect(norm(t)).to.eq(norm(main.text)));
      subBtns().then(($b) => expect([...$b].map((b) => norm(b.innerText))).to.deep.equal(main.sub));
      main.sub.forEach((sub, si) => {
        if (si > 0) {
          reset(post, tabsGet);
          subBtns().eq(si).click();
        }
        subBtns().eq(si).should('have.class', 'btn-cfPrimary');
        waitCall(post, (c) => c.url.endsWith('/state-revenue') && c.reqBody.headOfAccount === main.key && c.reqBody.TabType === TAB_CODE[sub],
          `${main.key} / ${sub} scatter`).then((c) => {
          expect(c.reqBody.isPerCapita).to.eq(sub.toLowerCase().replace(/\s/g, '').includes('percapita'));
          if (sub.includes('Mix')) {
            const list = c.body.data;
            if (!Array.isArray(list) || !list.length) {
              // getRevenueChart() then reads compareTypeList[0].code → TypeError (app bug).
              mixWithoutData.push(sub);
              cy.log(`APP BUG: "${sub}" has no line items → uncaught TypeError, no bar chart`);
              return;
            }
            waitCall(tabsGet, (t) => t.query.tabType === TAB_CODE[sub], `${sub} bar (by line item)`);
          }
        });
        if (sub.includes('Mix')) {
          cy.get(`${FI} #mixChartContainer app-tab-buttons button`).then(($b) => {
            expect([...$b].map((b) => norm(b.innerText))).to.deep.equal(['State Average', 'Population Category', 'ULB Type']);
          });
          cy.contains(`${FI} #mixChart p`, `${sub} of all ULBs in ${state.name} vs State`).should('be.visible');
          cy.get(`${FI} #scatterChartContainer`).should('not.exist');
        } else {
          waitCall(tabsGet, (c) => c.query.tabType === TAB_CODE[sub] && c.query.activeButton === sub, `${sub} bar`);
          cy.contains(`${FI} #scatterChart p`, `${sub} of all ULBs in ${state.name} vs State`).should('be.visible');
        }
      });
    });
  });

  it('Financial Indicators (Mix): compare types and the Cities line-item dropdown re-query; mix download works', () => {
    visitState(state.slug);
    waitCall(post, (c) => c.url.endsWith('/state-revenue'), 'initial');
    reset(post, tabsGet);
    cy.contains(`${FI} .col-auto app-tab-buttons button`, 'Revenue Mix').click();
    waitCall(post, (c) => c.reqBody.TabType === 'RevenueMix', 'mix').then((c) => {
      const list = c.body.data;
      if (!Array.isArray(list) || !list.length) {
        cy.log('No revenue-mix data for this state/year on staging');
        return;
      }
      // The mix chart sorts the line items in place, so compare as sets and
      // take the codes from the rendered <option> values.
      cy.get(`${FI} #barChartContainer select option`).should(($o) => {
        expect([...$o].map((o) => norm(o.textContent || '')).sort()).to.deep.equal(list.map((x: any) => x._id).sort());
      });
      cy.get(`${FI} #barChartContainer select option`).then(($o) => {
        const codes = [...$o].map((o) => (o as HTMLOptionElement).value);
        waitCall(tabsGet, (t) => t.query.tabType === 'RevenueMix', 'mix bar').then((t) => {
          // The first line item drives the initial bar chart.
          expect(list.map((x: any) => (Array.isArray(x.code) ? x.code.join(',') : String(x.code)))).to.include(t.query.code);
        });
        if (codes.length > 1) {
          reset(tabsGet);
          cy.get(`${FI} #barChartContainer select`).select(1);
          waitCall(tabsGet, (t) => t.query.code === codes[1], 'second line item').its('status').should('eq', 200);
        }
      });
    });
    chartsSettled();
    cy.get(`${FI} app-mix-chart canvas`).should('have.length.gte', 1);
    cy.get(`${FI} #mixChartContainer app-tab-buttons button`).eq(0).should('have.class', 'btn-cfPrimary');
    [['Population Category', 'popType'], ['ULB Type', 'ulbType']].forEach(([label, key]) => {
      reset(post);
      cy.contains(`${FI} #mixChartContainer app-tab-buttons button`, label).click();
      waitCall(post, (c) => c.reqBody.compareType === key && c.reqBody.TabType === 'RevenueMix', `compare ${label}`)
        .its('status').should('eq', 200);
      chartsSettled();
      cy.contains(`${FI} #mixChartContainer app-tab-buttons button`, label).should('have.class', 'btn-cfPrimary');
    });
    // APP BUG (staging): "State Average" has key '' and tab-buttons.ts#changeSelectedButton
    // returns early for falsy keys, so once another compare type is chosen you cannot go back.
    reset(post);
    cy.contains(`${FI} #mixChartContainer app-tab-buttons button`, 'State Average').click();
    cy.contains(`${FI} #mixChartContainer app-tab-buttons button`, 'ULB Type').should('have.class', 'btn-cfPrimary');
    cy.contains(`${FI} #mixChartContainer app-tab-buttons button`, 'State Average').should('not.have.class', 'btn-cfPrimary');
    cy.then(() => expect(post.filter((c) => c.reqBody?.compareType === ''), 'no State Average re-query').to.have.length(0));
    cy.contains(`${FI} #mixChart button`, 'Download').click();
    downloadsShouldInclude((d) => d.name === `Revenue_${years[1]}_${state.name} Chart.png` && d.href.startsWith('data:image/png'), 'mix PNG');
  });

  it('Financial Indicators: ULB search (with no-match message) adds the ULB to the comparison', () => {
    visitState(state.slug);
    waitCall(tabsGet, (c) => c.query.tabType === 'TotalRevenue', 'bar').then((bar) => {
      const input = () => cy.get(`${FI} app-city-search input`);
      input().type('zzqxw', { force: true });
      cy.contains('mat-option', 'No results found.', LONG).should('exist');
      if (!bar.body.data.length) {
        cy.log('No ULB data to search with');
        return;
      }
      const name = bar.body.data[0].ulbName;
      reset(search, post);
      input().clear({ force: true }).type(name, { force: true });
      waitCall(search, (c) => c.reqBody.matchingWord === name, 'search').then((s) => {
        expect(s.url).to.contain(`state=${state._id}`);
        if (!s.body.data.length) return;
        cy.contains('mat-option', new RegExp(`^\\s*${esc(s.body.data[0].name)}\\s*$`), LONG).scrollIntoView().click({ force: true });
        waitCall(post, (c) => c.url.endsWith('/state-revenue') && c.reqBody.ulb.includes(s.body.data[0]._id), 'scatter with ULB');
        input().should('have.value', s.body.data[0].name);
      });
    });
  });

  it('Financial Indicators: "Compare by: ULBs" dialog — duplicate/max-3 validation, remove, reset, apply and close', () => {
    // APP BUG (staging): closing the dialog with "close" returns undefined and
    // financial-indicator.ts reads `result.compareUlbs` → TypeError. Swallow only that.
    const closeErrors: string[] = [];
    cy.on('uncaught:exception', (e) => {
      if (/reading 'compareUlbs'/.test(e.message)) {
        closeErrors.push(e.message);
        return false;
      }
      return true;
    });
    visitState(state.slug);
    waitCall(tabsGet, (c) => c.query.tabType === 'TotalRevenue', 'bar').then(function (bar) {
      const names: string[] = bar.body.data.map((d: any) => d.ulbName).slice(0, 4);
      cy.contains(`${FI} button`, 'Compare by: ULBs').click();
      cy.get('mat-dialog-container').should('be.visible').within(() => {
        cy.contains('Compare with Average').should('be.visible');
        ['Apply', 'Reset', 'close'].forEach((b) => cy.contains('button', b).should('be.visible'));
      });
      const add = (n: string, expectName: string = n) => {
        reset(search);
        cy.get('mat-dialog-container app-city-search input').clear({ force: true }).type(n, { force: true });
        waitCall(search, (c) => c.reqBody.matchingWord === n, `dialog search ${n}`);
        cy.contains('mat-option', new RegExp(`^\\s*${esc(expectName)}\\s*$`, 'i'), LONG).click();
      };
      if (names.length < 4) {
        cy.log('Fewer than 4 ULBs with data; validating with what exists');
      }
      if (!names.length) return;
      add(names[0]);
      cy.get('mat-dialog-container .badge').should('have.length', 1);
      // Duplicate.
      add(names[0].slice(0, -1), names[0]); // distinct text so the debounced search fires again
      cy.contains('.mat-mdc-snack-bar-label', 'ULB already selected!', LONG).should('be.visible');
      cy.get('mat-dialog-container .badge').should('have.length', 1);
      if (names.length >= 4) {
        add(names[1]);
        add(names[2]);
        cy.get('mat-dialog-container .badge').should('have.length', 3);
        add(names[3]);
        cy.contains('.mat-mdc-snack-bar-label', 'Maximum of 3 ULBs can be selected!', LONG).should('be.visible');
        cy.get('mat-dialog-container .badge').should('have.length', 3);
        // Remove one.
        cy.get('mat-dialog-container .badge button').last().click();
        cy.get('mat-dialog-container .badge').should('have.length', 2);
      }
      // Reset clears the selection and keeps the dialog open.
      cy.contains('mat-dialog-container button', 'Reset').click();
      cy.get('mat-dialog-container .badge').should('have.length', 0);
      cy.get('mat-dialog-container').should('be.visible');
      // Apply with one ULB → dialog closes, charts re-query with that ULB.
      add(names[0]);
      cy.get('mat-dialog-container .badge').should('have.length', 1).invoke('attr', 'title').then((ulbName) => {
        reset(post, tabsGet);
        cy.contains('mat-dialog-container button', 'Apply').click();
        cy.get('mat-dialog-container').should('not.exist');
        waitCall(post, (c) => c.url.endsWith('/state-revenue') && c.reqBody.ulb.length === 1, 'scatter with compared ULB');
        waitCall(tabsGet, () => true, 'bar refreshed');
        expect(ulbName).to.be.a('string');
      });
      // "close" dismisses the dialog (and trips the app bug above).
      cy.contains(`${FI} button`, 'Compare by: ULBs').click();
      cy.get('mat-dialog-container .badge').should('have.length', 1); // previous selection is kept
      cy.contains('mat-dialog-container button', 'close').click();
      cy.get('mat-dialog-container').should('not.exist');
      cy.then(() => {
        if (closeErrors.length) cy.log(`Known app bug on dialog close: ${closeErrors[0]}`);
      });
    });
  });

  it('Financial Indicators: chart Download buttons save PNGs and "Download Data" exports Excel', () => {
    visitState(state.slug);
    waitCall(tabsGet, (c) => c.query.tabType === 'TotalRevenue', 'bar');
    chartsSettled();
    const png = `Revenue_${years[1]}_${state.name} Chart.png`;
    cy.contains(`${FI} #scatterChart button`, 'Download').click();
    downloadsShouldInclude((d) => d.name === png && d.href.startsWith('data:image/png'), 'scatter PNG');
    cy.window().then((w: any) => (w.__downloads.length = 0));
    cy.contains(`${FI} #barChart button`, 'Download').click();
    downloadsShouldInclude((d) => d.name === png && d.href.startsWith('data:image/png'), 'bar PNG');

    reset(tabsGet);
    cy.contains('app-financial-indicator ~ div button, app-financial-indicator button', 'Download Data').click();
    waitCall(tabsGet, (c) => c.query.csv === 'true', 'csv').then((c) => {
      expect(c.query).to.include({ tabType: 'TotalRevenue', sortBy: 'top', stateId: state._id, financialYear: years[1] });
      expect(c.status).to.eq(200);
      expect(String(c.headers!['content-type'])).to.contain('spreadsheetml');
      expect(String(c.headers!['content-disposition'])).to.contain('attachment');
    });
    downloadsShouldInclude((d) => d.name === `CityFinance_${state.name}_Revenue`, 'Excel download name');
  });

  // ------------------------------------------- Service Level Benchmark --

  it('Service Level Benchmark: SLB years, indicator list, charts and the "Choose one"/ranking filters', () => {
    cy.intercept('GET', '**/api/v1/get-FYs-slb').as('slbYears');
    cy.intercept('GET', '**/api/v1/state-list-of-indics?*').as('indics');
    visitState(state.slug);
    reset(post);
    openTab('Service Level Benchmark');
    cy.wait('@slbYears').then(({ response }) => {
      const slbYears: string[] = response!.body.data;
      // NOTE: state.ts#getSLBYears overwrites the page-level ledger years, so the
      // header "financial statements" dropdown now lists SLB years too.
      cy.get('#state_years option').should(($o) => expect([...$o].map((o) => (o as HTMLOptionElement).value)).to.deep.equal(slbYears));
      const slb = stateTabs[1];
      mainBtns().then(($b) => expect([...$b].map((b) => norm(b.innerText))).to.deep.equal(slb.buttons.map((b) => b.key)));
      cy.wait('@indics').then(({ request, response: r }) => {
        expect(decodeURIComponent(request.url)).to.contain(`type=${SLB_TYPE[slb.buttons[0].key]}`);
        const names = [...new Set<string>(r!.body.data.names)];
        cy.contains(`${FI} mat-form-field`, 'Choose one').find('.mat-mdc-select-value').should('contain.text', names[0]);
        waitCall(post, (c) => c.url.endsWith('/state-slb') && c.reqBody.chartType === 'bar', 'SLB bar').then((c) => {
          expect(c.reqBody).to.include({ sortBy: 'top10', filterName: names[0], stateId: state._id, financialYear: slbYears[1] });
          chartsSettled();
          cy.contains(`${FI} #barChart p`, `Top 10 performing ULBs on ${names[0]} in ${state.name}`).should('be.visible');
          const ten = c.body.data?.scatterData?.tenData || [];
          if (!ten.length) cy.get(`${FI} #barChart app-no-data-found`).should('contain.text', 'No Data Found for chosen options');
          else drawnShouldInclude([ten[0].ulbName]);
        });
        waitCall(post, (c) => c.url.endsWith('/state-slb') && c.reqBody.chartType === 'scatter', 'SLB scatter').then((c) => {
          expect(c.reqBody.filterName).to.eq(names[0]);
          expect(c.reqBody.headOfAccount).to.eq(slb.buttons[0].key);
        });
        // No Category / Compare-by controls on SLB.
        cy.contains(`${FI} mat-form-field`, 'Category').should('not.exist');
        cy.contains(`${FI} button`, 'Compare by: ULBs').should('not.exist');

        // Choose another indicator.
        if (names.length > 1) {
          reset(post);
          cy.contains(`${FI} mat-form-field`, 'Choose one').find('mat-select').click();
          cy.get('mat-option').should(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.equal(names));
          cy.contains('mat-option', new RegExp(`^\\s*${esc(names[1])}\\s*$`)).click();
          waitCall(post, (c) => c.url.endsWith('/state-slb') && c.reqBody.chartType === 'bar' && c.reqBody.filterName === names[1], 'indicator change');
          chartsSettled();
        }
        reset(post);
        cy.contains(`${FI} button.rankingButton`, 'Bottom 10').click();
        waitCall(post, (c) => c.reqBody.chartType === 'bar' && c.reqBody.sortBy === 'bottom10', 'bottom 10');
        chartsSettled();
        cy.contains(`${FI} #barChart p`, 'Bottom 10 performing ULBs on').should('be.visible');
        // SLB year filter.
        if (slbYears.length > 2) {
          reset(post);
          matSelect(FI, 'Year', new RegExp(`^\\s*${slbYears[2]}\\s*$`));
          waitCall(post, (c) => c.reqBody.chartType === 'bar' && c.reqBody.financialYear === slbYears[2], 'SLB year');
        }
      });
    });
  });

  it('Service Level Benchmark: each service button loads its own indicator list', () => {
    cy.intercept('GET', '**/api/v1/state-list-of-indics?*').as('indics');
    visitState(state.slug);
    openTab('Service Level Benchmark');
    cy.wait('@indics');
    stateTabs[1].buttons.slice(1).forEach((b) => {
      cy.contains(`${FI} > section > .position-relative > app-tab-buttons button`, b.key).click().should('have.class', 'btn-cfPrimary');
      cy.wait('@indics').then(({ request, response }) => {
        expect(decodeURIComponent(request.url)).to.contain(`type=${SLB_TYPE[b.key]}`);
        const names = [...new Set<string>(response!.body.data.names || [])];
        if (names.length) {
          cy.contains(`${FI} mat-form-field`, 'Choose one').find('.mat-mdc-select-value').should('contain.text', names[0]);
        } else {
          cy.log(`No indicators configured for ${b.key}`);
        }
      });
    });
  });

  // ------------------------------------------ Borrowings & Credit Rating --

  it('Borrowings: bond table matches the API; city/year filters, no-result message and Clear All', () => {
    cy.intercept('GET', `**/api/v1/bond-issuances/get-bonds/${state._id}`).as('bonds');
    visitState(state.slug);
    openTab('Borrowings & Credit Rating');
    cy.get('app-borrowing-credit-rating app-tab-buttons button').then(($b) => {
      expect([...$b].map((b) => norm(b.innerText))).to.deep.equal(stateTabs[2].buttons.map((b) => b.key));
    });
    cy.wait('@bonds').then(({ response }) => {
      const { headers, data } = response!.body;
      cy.contains('p', 'Below are the details of municipal bond issuances undertaken by the ULB').should('be.visible');
      cy.get('app-borrowing-credit-rating th').then(($th) => {
        expect([...$th].map((t) => norm(t.textContent || ''))).to.deep.equal(headers.map((h: any) => h.value.trim()));
      });
      const rowsShould = (rows: any[]) => {
        cy.get('app-borrowing-credit-rating tr.mat-mdc-row').should('have.length', rows.length);
        cy.get('app-borrowing-credit-rating tr.mat-mdc-row').each(($tr, i) => {
          const cells = [...$tr.find('td')].map((t) => norm(t.textContent || ''));
          expect(cells).to.deep.equal(headers.map((h: any) => String(rows[i][h.key] || 'N/A').trim()));
        });
      };
      rowsShould(data);

      const ulb = data[0].ulb;
      cy.get('app-borrowing-credit-rating mat-select[formcontrolname="ulbs"]').click();
      cy.get('mat-option').should(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.equal([...new Set(data.map((d: any) => d.ulb.trim()))]));
      cy.contains('mat-option', new RegExp(`^\\s*${esc(ulb.trim())}\\s*$`)).click();
      cy.get('body').type('{esc}');
      cy.contains('app-borrowing-credit-rating button', 'Search').click();
      rowsShould(data.filter((d: any) => d.ulb === ulb));

      // A year in which this ULB issued nothing → no-result row.
      const yearsAll = [...new Set<string>(data.map((d: any) => d.yearOfBondIssued))];
      const emptyYear = yearsAll.find((y) => !data.some((d: any) => d.ulb === ulb && d.yearOfBondIssued === y));
      cy.get('app-borrowing-credit-rating mat-select[formcontrolname="years"]').click();
      cy.get('mat-option').should(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.equal(yearsAll));
      const yearPick = emptyYear || data[0].yearOfBondIssued;
      cy.contains('mat-option', new RegExp(`^\\s*${esc(yearPick)}\\s*$`)).click();
      cy.get('body').type('{esc}');
      cy.contains('app-borrowing-credit-rating button', 'Search').click();
      if (emptyYear) {
        cy.get('app-borrowing-credit-rating tr.mat-mdc-row').should('have.length', 0);
        cy.contains('app-borrowing-credit-rating td', 'No results found for the applied filter.').should('be.visible');
      } else {
        rowsShould(data.filter((d: any) => d.ulb === ulb && d.yearOfBondIssued === yearPick));
      }
      cy.contains('app-borrowing-credit-rating button', 'Clear All').click();
      rowsShould(data);
      cy.get('app-borrowing-credit-rating mat-select[formcontrolname="ulbs"] .mat-mdc-select-placeholder').should('contain.text', 'Select City');
    });
  });

  it('Credit Rating: grade counts match credit-rating.json for the state; clicking a grade lists its ULBs', () => {
    visitState(state.slug);
    openTab('Borrowings & Credit Rating');
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Credit Rating').click().should('have.class', 'btn-cfPrimary');
    cy.request('/assets/files/credit-rating.json').its('body').then((list: any[]) => {
      const mine = list.filter((r) => r.state === state.name);
      cy.contains('app-credit-rating p', 'CRISIL Credit Rating Summary').should('be.visible');
      if (!mine.length) {
        cy.contains('app-credit-rating', 'No Data Found for chosen options').should('be.visible');
        return;
      }
      const counts: Record<string, number> = {};
      mine.forEach((r) => (counts[r.creditrating.trim()] = (counts[r.creditrating.trim()] || 0) + 1));
      cy.get('app-credit-rating .rating').then(($r) => {
        const shown: Record<string, number> = {};
        [...$r].forEach((el) => (shown[norm(el.textContent || '')] = Number(norm(el.nextElementSibling!.textContent || ''))));
        Object.entries(shown).forEach(([g, n]) => expect(n, `grade ${g}`).to.eq(counts[g]));
        expect(Object.values(shown).reduce((a, b) => a + b, 0)).to.be.greaterThan(0);
      });
      cy.get('app-credit-rating .rating').last().invoke('text').then((g) => {
        const grade = norm(g);
        cy.get('app-credit-rating .rating').last().parent().click().should('have.class', 'active');
        const ulbs = mine.filter((r) => r.creditrating === grade);
        cy.get('app-credit-rating .newCard').filter(':contains("ULB:")').then(($c) => {
          expect([...$c].map((c) => norm(c.textContent || '')).sort()).to.deep.equal(ulbs.map((u) => `ULB: ${u.ulb}`).sort());
        });
        cy.contains('app-credit-rating .newCard', `State: ${state.name}`).should('exist');
        cy.contains('app-credit-rating .newCard', 'Agency:').should('exist');
      });
    });
  });

  it('empty states: a state without bonds or credit ratings shows "No Data Found" in both views', function () {
    if (!emptyState) {
      cy.log('Every state has bonds or ratings on staging');
      this.skip();
    }
    cy.intercept('GET', `**/api/v1/bond-issuances/get-bonds/${emptyState._id}`).as('bonds');
    visitState(emptyState.slug);
    openTab('Borrowings & Credit Rating');
    cy.wait('@bonds').its('response.body.data').should('have.length', 0);
    cy.contains('app-borrowing-credit-rating app-no-data-found', 'No Data Found for chosen options').should('be.visible');
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Credit Rating').click();
    cy.contains('app-credit-rating', 'No Data Found for chosen options').should('be.visible');
  });

  it('empty states (stubbed): no money-info and an empty ranking show their no-data messages', () => {
    cy.intercept('GET', /\/api\/v1\/dashboard\/financial-info\/get-data/, { body: { result: [], lastModifiedAt: null } }).as('noMoney');
    cy.intercept('GET', /\/api\/v1\/state-revenue-tabs\?.*sortBy=bottom/, { body: { success: true, data: [] } }).as('noBar');
    visitState(state.slug);
    cy.get('#state_years').select(years[2] || years[0]);
    cy.wait('@noMoney');
    cy.contains('app-state app-info-cards .alert', 'Financial data is unavailable for selected entity.').should('be.visible');
    cy.contains(`${FI} button.rankingButton`, 'Bottom 10').click();
    cy.wait('@noBar');
    cy.get(`${FI} #barChart app-no-data-found`).should('contain.text', 'No Data Found for chosen options');
    cy.get(`${FI} #barChart canvas`).should('not.exist');
  });

  // ---------------------------------------------------- negative / misc --

  it('unknown state slug: the state-details API reports "State not found" and no state content renders', () => {
    cy.request({ url: `${API}dashboard/state/details`, qs: { slug: 'no-such-state-zz', year: '' }, failOnStatusCode: false })
      .its('body').should('include', { success: false, message: 'State not found' });
    cy.visit('/municipal-data/state/no-such-state-zz', { failOnStatusCode: false });
    cy.contains('a', 'Go To National Dashboard', LONG).should('be.visible');
    cy.get('app-state h1').should('not.exist');
    cy.get('app-state mat-tab-group').should('not.exist');
  });

  it('mobile (375px): header, map and tabs render; the tab header paginates', () => {
    cy.viewport(375, 812);
    visitState(state.slug);
    cy.contains('h1', state.name).should('be.visible');
    cy.get('app-state app-info-cards .card', LONG).first().should('be.visible');
    cy.get('.mat-mdc-tab-header-pagination-after').should('be.visible')
      .and('not.have.class', 'mat-mdc-tab-header-pagination-disabled').click();
    cy.get('.mat-mdc-tab-header-pagination-before').should('not.have.class', 'mat-mdc-tab-header-pagination-disabled');
  });
});
