/**
 * Public (logged-out) — National dashboard.
 * URL: /municipal-data/national
 *
 * Built from the cf-ui-ssr-v3 (Angular 20 SSR, `staging` branch) sources —
 * pages/dashboard/national/** and the shared grid-view / info-cards /
 * state-search / tab-buttons / map / charts components — and the
 * cf-nest-api-v2 API shapes, then checked against staging.
 *
 * The page is server-side rendered with Angular's HTTP transfer cache, so the
 * GET calls made while rendering on the server are NOT repeated by the
 * browser. Expected values for the first paint therefore come from the same
 * API URLs fetched with cy.request; everything triggered by a user action
 * (filters, tabs, buttons, downloads) is asserted through cy.intercept.
 *
 * Read-only: no form on this page writes data. Excel downloads are asserted
 * on the request/response (status + content type/disposition) and the
 * programmatic <a download> click is captured instead of saving a file.
 */
export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const PAGE = '/municipal-data/national';
const API = '/api/v1/';
const NATIONAL_DASHBOARD_ID = '619cc10e6abe7f5b80e45c6d';
const LONG = { timeout: 30000 };

// Static app structure from national-table.ts#getType().
const BUTTON_TYPE: Record<string, string> = {
  'Total Revenue': 'totalRevenue',
  'Revenue Mix ': 'revenueMix',
  'Total Expenditure': 'totalExpenditure',
  'Expenditure Mix': 'expenditureMix',
  'Deficit or Surplus': 'deficitOrSurplus',
  'Total Own Revenue': 'totalOwnRevenue',
  'Own Revenue Mix ': 'OwnrevenueMix',
  'Capital Expenditure': 'totalCapexpense',
};
// national-chart.ts#barGraphDropdown, grouped by tab ("code").
const GRAPH_OPTIONS: Record<string, string[]> = {
  Revenue: ['Revenue', 'Revenue Per Capita'],
  Expenditure: ['Expenditure', 'Expenditure Per Capita'],
  'Own Revenue': ['Own Revenue', 'Own Revenue Per Capita'],
  'Capital Expenditure': ['Capital Expenditure', 'Capital Expenditure Per Capita'],
};
// data-availability.ts#GRAPH_LEGEND
const LEGEND = [
  { label: '81%-100%', min: 81, max: 100, color: '#2c448c' },
  { label: '61%-80%', min: 61, max: 80, color: '#3e5db1' },
  { label: '26%-60%', min: 26, max: 60, color: '#7a91d1' },
  { label: '1%-25%', min: 1, max: 25, color: '#c3cdee' },
  { label: '0%', min: 0, max: 0, color: '#e0e3ecff' },
];

// ---------------------------------------------------------------- helpers --

type Call = {
  method: string;
  url: string;
  query: Record<string, any>;
  status?: number;
  headers?: Record<string, any>;
  body?: any;
  done: boolean;
};

/** Records every matching request together with its response. */
function record(method: string, matcher: RegExp): Call[] {
  const calls: Call[] = [];
  cy.intercept(method, matcher, (req) => {
    const c: Call = { method: req.method, url: req.url, query: req.query as any, done: false };
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

/** Retries until a finished call matches; yields the latest such call. */
function waitCall(calls: Call[], pred: (c: Call) => boolean, msg: string): Cypress.Chainable<Call> {
  return cy
    .wrap(null, { log: false, timeout: 30000 })
    .should(() => {
      expect(calls.filter((c) => c.done && pred(c)), msg).to.have.length.greaterThan(0);
      expect(calls.every((c) => c.done), `${msg}: all in-flight calls settled`).to.be.true;
    })
    .then(() => calls.filter((c) => c.done && pred(c)).pop() as Call);
}

function apiGet(path: string, qs: Record<string, any> = {}) {
  return cy.request({ url: API + path, qs }).its('body');
}

/** Replica of core/pipes/inr-format.pipe.ts ('auto', with ₹ and unit). */
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

/** Replica of a national-table cell: inrFormat:'inr' (no symbol/unit) for numerics, raw otherwise. */
function cellText(v: any): string {
  if (isNaN(Number(v))) return v === undefined || v === null ? '' : String(v).trim();
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function mediumDates(iso: string): string[] {
  const d = new Date(iso);
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return [d.toLocaleDateString('en-US', o), d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })];
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** dashboard-service.ts#formatTabs */
function formatTabs(data: any[]) {
  return [...data]
    .sort((a, b) => a.position - b.position)
    .map((tab) => ({
      name: tab.name as string,
      text: tab.subHeaders?.[0]?.mainContent?.[0]?.about as string,
      buttons: (tab.subHeaders?.[0]?.mainContent?.[0]?.btnLabels || []) as string[],
    }));
}

/** Records canvas text (Chart.js axis titles, tick labels, legends) and captures download clicks. */
function instrument(win: any) {
  win.__drawn = [] as string[];
  win.__drawnSet = new Set<string>();
  win.__downloads = [] as { name: string; href: string }[];
  const proto = win.CanvasRenderingContext2D.prototype;
  const fill = proto.fillText;
  proto.fillText = function (text: any, ...rest: any[]) {
    const s = String(text);
    if (!win.__drawnSet.has(s)) { win.__drawnSet.add(s); win.__drawn.push(s); }
    return fill.apply(this, [text, ...rest]);
  };
  const click = win.HTMLAnchorElement.prototype.click;
  win.HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      win.__downloads.push({ name: this.download, href: String(this.href).slice(0, 40) }); // data: URLs can be huge
      return; // don't actually save the file
    }
    return click.apply(this);
  };
}

function clearDrawn() {
  cy.window().then((w: any) => { w.__drawn.length = 0; w.__drawnSet.clear(); });
}
function drawnShouldInclude(texts: string[]) {
  cy.window().its('__drawn', LONG).should((drawn: string[]) => {
    texts.forEach((t) => expect(drawn, `canvas text "${t}"`).to.include(t));
  });
}

function drawnShouldMatch(re: RegExp) {
  cy.window().its('__drawn', LONG).should((drawn: string[]) => {
    expect(drawn.some((d) => re.test(d)), `canvas text matching ${re}`).to.be.true;
  });
}

/** Visit and wait until the client app is hydrated (Leaflet only runs in the browser). */
function visitNational() {
  cy.visit(PAGE, { onBeforeLoad: instrument, timeout: 120000 }); // staging is sometimes slow to fire load
  cy.get('#map-container.leaflet-container path.leaflet-interactive', { timeout: 60000 }).should('have.length.gt', 10);
}

/**
 * Opens a dashboard tab. For financial tabs pass the recorder: opening one
 * fires the same data request twice (main tab-buttons effect + the table's own
 * tab-buttons init) and the app does not cancel stale requests, so we wait for
 * both before interacting — otherwise a late response overwrites the next filter's.
 */
function openTab(name: string, calls?: Call[]) {
  if (calls) cy.then(() => (calls.length = 0));
  cy.contains('.mdc-tab', new RegExp(`^\\s*${name.replace(/[&]/g, '\\$&')}\\s*$`)).click();
  cy.contains('.mdc-tab--active', name).should('exist');
  if (calls) {
    cy.wrap(null, { log: false, timeout: 30000 }).should(() => {
      expect(calls.filter((c) => c.done && !c.query.csv), `initial ${name} requests`).to.have.length.gte(2);
      expect(calls.every((c) => c.done)).to.be.true;
    });
  }
}

function tableSettled() {
  cy.get('app-national-table .custom-spinner-overlay', LONG).should('not.exist');
  cy.get('app-national-table app-pre-loader', LONG).should('not.exist');
}

/** Asserts the mat-table equals what national-table.ts#setTable() renders for `data`. */
function assertTable(data: any) {
  const rows = data.rows.filter((r: any) => Object.keys(r).length > 0 && r.ulbType !== 'Average');
  const visible = rows.filter((r: any) => r.ulb_pop_category !== 'Average');
  // Retrying: the intercept sees the response before Angular re-renders the table.
  cy.get('app-national-table table[mat-table] th', LONG).should(($th) => {
    expect([...$th].map((e) => norm(e.innerText))).to.deep.equal(data.columns.map((c: any) => c.display_name));
  });
  cy.get('app-national-table table[mat-table] tr[mat-row]', LONG).should(($tr) => {
    const shown = [...$tr].filter((tr) => !tr.hasAttribute('hidden'));
    expect(shown, 'visible rows').to.have.length(visible.length);
    shown.forEach((tr, i) => {
      const cells = [...tr.querySelectorAll('td')].map((td) => norm((td as HTMLElement).innerText));
      expect(cells, `row ${i}`).to.deep.equal(data.columns.map((c: any) => cellText(visible[i][c.key])));
    });
    // Last data row (the "All ULBs"/total row) is bold.
    expect(shown[shown.length - 1].querySelector('td')!.className).to.contain('fw-bold');
  });
}

// ------------------------------------------------------------ live data --

let years: string[] = [];
let tabs: ReturnType<typeof formatTabs> = [];
let states: any[] = [];

before(() => {
  apiGet('common/get-latest-standardized-year').then((b) => (years = b.ledgerYears));
  apiGet(`dashboardHeaders/${NATIONAL_DASHBOARD_ID}`).then((b) => (tabs = formatTabs(b.data)));
  apiGet('state').then((b) => (states = b.data));
});

describe('Public | National dashboard', () => {
  let nd: Call[]; // national table/chart data + csv
  let money: Call[];
  let mapCalls: Call[];

  let mapErrors: string[];

  beforeEach(() => {
    // APP BUG (staging): when the Data Availability map redraws for a selected state
    // (map click or state search), Leaflet sometimes throws
    // "Cannot read properties of undefined (reading 'lat')" (a sticky state tooltip
    // outliving its removed layer). Swallow only that message and log it.
    mapErrors = [];
    cy.on('uncaught:exception', (e) => {
      if (/reading 'lat'/.test(e.message)) {
        mapErrors.push(e.message);
        return false;
      }
      return true;
    });
    nd = record('GET', /\/api\/v1\/(national-dashboard\/[\w-]+|dashboard\/national\/data-availability)\?/);
    money = record('GET', /\/api\/v1\/dashboard\/financial-info\/get-data/);
    mapCalls = record('GET', /\/api\/v1\/get-statewise-data-availability/);
  });

  // ------------------------------------------------------------ header --

  it('shows the heading, headline indicator grid and their info tooltips (home-page get-Data API)', () => {
    visitNational();
    cy.title().should('eq', 'Municipal Financial Data of Indian Cities | City Finance');
    cy.get('meta[name="description"]').should('have.attr', 'content').and('contain', 'aggregated data availability');
    cy.contains('h1', 'National Performance').should('be.visible');
    cy.contains('Summary of key national-level demographics and municipal (urban) indicators').should('be.visible');

    apiGet('dashboard/home-page/get-Data').then((res) => {
      const grid = [...res.gridDetails].sort((a: any, b: any) => a.sequence - b.sequence);
      cy.get('app-national app-grid-view .explore-data-grid > div').should('have.length', grid.length);
      grid.forEach((item: any, i: number) => {
        cy.get('app-national app-grid-view .explore-data-grid > div').eq(i).within(() => {
          cy.get('p').eq(0).invoke('text').should((t) => expect(norm(t)).to.eq(String(item.value)));
          cy.get('p').eq(1).invoke('text').should((t) => expect(norm(t)).to.eq(item.label));
          cy.get('i.bi-info-circle').should('have.length', item.info ? 1 : 0);
        });
      });
      // Info tooltip shows the multi-line breakdown.
      const withInfo = grid.findIndex((g: any) => g.info);
      if (withInfo >= 0) {
        cy.get('app-national app-grid-view .explore-data-grid > div').eq(withInfo).find('i.bi-info-circle').trigger('mouseenter');
        cy.get('.mat-mdc-tooltip', LONG).should('be.visible').invoke('text')
          .then((t) => expect(norm(t)).to.eq(norm(grid[withInfo].info)));
        cy.get('app-national app-grid-view .explore-data-grid > div').eq(withInfo).find('i.bi-info-circle').trigger('mouseleave');
      } else {
        cy.log('No headline indicator carries an info tooltip on staging');
      }
      // "Last updated on" uses lastModifiedAt | date:'mediumDate'.
      cy.contains('p', 'Last updated on:').invoke('text').then((t) => {
        const dates = mediumDates(res.lastModifiedAt);
        expect(dates.some((d) => t.includes(d)), `one of ${dates}`).to.be.true;
      });
    });
  });

  it('shows the money-info cards for the default ledger year with value formatting and tooltips', () => {
    visitNational();
    cy.get('#national_years option').then(($o) => {
      expect([...$o].map((o) => (o as HTMLOptionElement).value)).to.deep.equal(years);
    });
    // national.ts selects ledgerYears[1].
    cy.get('#national_years').should('have.value', years[1]);
    apiGet('dashboard/financial-info/get-data', { year: years[1] }).then((res) => {
      cy.get('app-national app-info-cards .card').should('have.length', res.result.length);
      res.result.forEach((c: any, i: number) => {
        cy.get('app-national app-info-cards .card').eq(i).within(() => {
          cy.get('img').should('have.attr', 'alt', c.label).and('have.attr', 'src', c.src);
          cy.get('p.fw-bold').should('have.text', inrAuto(c.value));
          cy.get('p.text-secondary').invoke('text').should((t) => expect(norm(t)).to.eq(c.label));
        });
      });
      const tipIdx = res.result.findIndex((c: any) => c.tooltip);
      cy.get('app-national app-info-cards .card').eq(tipIdx).find('i.bi-info-circle').trigger('mouseenter');
      cy.get('.mat-mdc-tooltip', LONG).should('be.visible').invoke('text')
        .then((t) => expect(norm(t)).to.eq(norm(res.result[tipIdx].tooltip)));
    });
  });

  it('re-fetches the money-info cards when the source year is changed', () => {
    visitNational();
    const target = years[2] || years[0];
    cy.get('#national_years').select(target);
    waitCall(money, (c) => c.query.year === target, `financial-info for ${target}`).then((c) => {
      expect(c.status).to.eq(200);
      cy.get('#national_years').should('have.value', target);
      if (!c.body.result.length) {
        cy.contains('app-info-cards .alert', 'Financial data is unavailable for selected entity.').should('be.visible');
        return;
      }
      c.body.result.forEach((card: any, i: number) => {
        cy.get('app-national app-info-cards .card').eq(i).find('p.fw-bold').should('have.text', inrAuto(card.value));
      });
    });
    // Selecting the same year again does not re-query (onMoneyInfoYearChange guards on change).
    cy.then(() => (money.length = 0));
    cy.get('#national_years').trigger('change');
    cy.get('app-national app-info-cards').should('exist');
    cy.then(() => expect(money, 'no re-query for unchanged year').to.have.length(0));
  });

  it('lists the dashboard tabs from the dashboard-headers API in position order, Data Availability first', () => {
    visitNational();
    cy.contains('h3', 'Dashboard').should('be.visible');
    cy.get('.mdc-tab .mdc-tab__text-label').then(($t) => {
      expect([...$t].map((e) => norm(e.textContent || ''))).to.deep.equal(tabs.map((t) => t.name));
    });
    cy.get('.mdc-tab').eq(0).should('have.attr', 'aria-selected', 'true');
    cy.get('app-data-availability').should('exist');
  });

  // ------------------------------------------------- Data Availability --

  it('Data Availability: map shades, legend and population-category table match the APIs', () => {
    visitNational();
    cy.contains('app-data-availability p', '% of Data Availability on Cityfinance.in').should('be.visible');
    cy.get('app-data-availability .custom-font-size-8 .d-flex p').then(($p) => {
      expect([...$p].map((p) => norm(p.textContent || ''))).to.deep.equal(LEGEND.map((l) => l.label));
    });
    // No Table/Graph toggle in the Data Availability tab, and the UT footnote is shown.
    cy.get('app-data-availability mat-button-toggle-group').should('not.exist');
    cy.contains('i', 'Data shown here includes Union Territories').should('be.visible');
    cy.get('app-national-table app-tab-buttons button').then(($b) => {
      expect([...$b].map((b) => norm(b.innerText))).to.deep.equal(['Population Category', 'ULB Type']);
    });
    cy.get('app-national-table app-tab-buttons button').eq(0).should('have.class', 'btn-cfPrimary');
    cy.get('app-national-table #state_years').should('have.value', years[1]);

    apiGet('dashboard/national/data-availability', {
      financialYear: years[1], formType: 'populationCategory', type: '', stateId: '', ulbType: '', population: true,
    }).then((res) => assertTable(res.data));

    apiGet('get-statewise-data-availability', { financialYear: years[1], population: true }).then((res) => {
      const shade = (p: number) => (LEGEND.find((l) => p >= l.min && p <= l.max) || LEGEND[4]).color;
      const expected = [...new Set<string>(res.data.map((s: any) => shade(s.percentage)))];
      cy.get('#map-container path.leaflet-interactive').should(($p) => {
        const fills = new Set([...$p].map((p) => p.getAttribute('fill')));
        expected.forEach((c) => expect([...fills], `a state shaded ${c}`).to.include(c));
      });
    });
  });

  it('Data Availability: hovering a state shows its name tooltip', () => {
    visitNational();
    cy.get('#map-container path.leaflet-interactive').then(($p) => {
      const biggest = [...$p].sort((a, b) => {
        const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      })[0];
      cy.wrap(biggest).trigger('mouseover', { force: true });
      cy.get('.leaflet-tooltip', LONG).should('be.visible').invoke('text').then((t) => {
        expect(states.map((s) => s.name.toLowerCase())).to.include(norm(t).toLowerCase());
      });
      cy.wrap(biggest).trigger('mouseout', { force: true });
    });
  });

  it('Data Availability: ULB Type button and the year filter re-query the table and the map', () => {
    visitNational();
    cy.then(() => (nd.length = 0));
    cy.contains('app-national-table app-tab-buttons button', 'ULB Type').click().should('have.class', 'btn-cfPrimary');
    waitCall(nd, (c) => c.query.formType === 'ulbType', 'ULB-type data availability').then((c) => {
      expect(c.url).to.contain('/dashboard/national/data-availability');
      expect(c.query).to.include({ ulbType: 'true', population: '', financialYear: years[1], stateId: '' });
      tableSettled();
      assertTable(c.body.data);
    });

    const target = years[2] || years[0];
    cy.then(() => { nd.length = 0; mapCalls.length = 0; });
    cy.get('app-national-table #state_years').select(target);
    waitCall(nd, (c) => c.query.financialYear === target, `table for ${target}`).then((c) => {
      tableSettled();
      assertTable(c.body.data);
    });
    // The map is re-fetched for the new year. NOTE: national.service.ts uses
    // `if (type = 'populationCategory')` (assignment), so it always sends population=true.
    waitCall(mapCalls, (c) => c.query.financialYear === target, `map for ${target}`).then((c) => {
      expect(c.query.population).to.eq('true');
      expect(c.status).to.eq(200);
    });
  });

  it('Data Availability: state search filters the table, links to the state dashboard; Reset restores India', () => {
    visitNational();
    // Negative: unknown state.
    cy.get('app-national-table input#stateName').click({ force: true }).type('zzqx', { force: true });
    cy.contains('mat-option', 'No results found for your search.', LONG).should('be.visible')
      .and('have.attr', 'aria-disabled', 'true');
    cy.get('app-national-table input#stateName').clear({ force: true });

    apiGet('get-statewise-data-availability', { financialYear: years[1], population: true }).then((res) => {
      const best = [...res.data].sort((a: any, b: any) => b.percentage - a.percentage)[0];
      const state = states.find((s) => s._id === best.stateId);
      cy.then(() => { nd.length = 0; });
      cy.get('app-national-table input#stateName').click({ force: true }).type(state.name.slice(0, 5), { force: true });
      cy.get('mat-option', LONG).should(($o) => {
        const names = [...$o].map((o) => norm(o.textContent || ''));
        expect(names.length).to.be.greaterThan(0);
        names.forEach((n) => expect(n.toLowerCase()).to.contain(state.name.slice(0, 5).toLowerCase()));
      });
      cy.contains('mat-option', new RegExp(`^\\s*${state.name}\\s*$`)).click();
      waitCall(nd, (c) => c.query.stateId === state._id, 'state-filtered table').then((c) => {
        tableSettled();
        assertTable(c.body.data);
      });
      cy.get('app-national-table input#stateName').should('have.value', state.name);
      // Map zooms to the single state and offers a reset.
      cy.get('#map-container path.leaflet-interactive').should('have.length', 1);
      cy.contains('button', 'Reset Map To India').should('be.visible');
      cy.contains('button', 'View State Dashboard').should('be.visible');

      // Clear (x) only empties the input text.
      cy.get('app-national-table button[aria-label="Clear"]').click();
      cy.get('app-national-table input#stateName').should('have.value', '');

      // Reset: stateId cleared, state-specific affordances removed, year kept.
      cy.then(() => { nd.length = 0; });
      cy.contains('app-national-table [role="button"]', 'Reset').click();
      waitCall(nd, (c) => c.query.stateId === '' && !c.query.csv, 'reset table').then((c) => {
        expect(c.query.financialYear).to.eq(years[1]);
        tableSettled();
        assertTable(c.body.data);
      });
      cy.contains('button', 'View State Dashboard').should('not.exist');
      cy.contains('button', 'Reset Map To India').should('not.exist');
      cy.get('#map-container path.leaflet-interactive', { timeout: 60000 }).should('have.length.gt', 10);
    });
  });

  it('Data Availability: "View State Dashboard" navigates to the selected state page', () => {
    visitNational();
    const state = states.find((s) => s.slug && !s.isUT) || states[0];
    cy.get('app-national-table input#stateName').click({ force: true }).type(state.name.slice(0, 6), { force: true });
    cy.contains('mat-option', new RegExp(`^\\s*${state.name}\\s*$`), LONG).click();
    cy.contains('button', 'View State Dashboard').click();
    cy.location('pathname', LONG).should('eq', `/municipal-data/state/${state.slug}`);
    cy.contains('h1', state.name, LONG).should('be.visible');
  });

  it('Data Availability: clicking a state on the map selects it; "Reset Map To India" restores the national view', () => {
    visitNational();
    cy.then(() => (nd.length = 0));
    cy.get('#map-container path.leaflet-interactive').then(($p) => {
      const biggest = [...$p].sort((a, b) => {
        const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      })[0];
      cy.wrap(biggest).click({ force: true });
    });
    waitCall(nd, (c) => !!c.query.stateId, 'state picked on map').then((c) => {
      const state = states.find((s) => s._id === c.query.stateId);
      expect(state, 'state from /state list').to.exist;
      cy.get('app-national-table input#stateName').should('have.value', state.name);
      tableSettled();
      assertTable(c.body.data);
      cy.contains('button', 'Reset Map To India').should('be.visible');
      cy.get('#map-container path.leaflet-interactive').should('have.length', 1);
    });
    cy.then(() => (nd.length = 0));
    cy.contains('button', 'Reset Map To India').click();
    waitCall(nd, (c) => c.query.stateId === '', 'national table after map reset');
    cy.contains('button', 'Reset Map To India').should('not.exist');
    cy.get('#map-container path.leaflet-interactive', { timeout: 60000 }).should('have.length.gt', 10);
    cy.get('app-national-table input#stateName').should('have.value', '');
    cy.then(() => { if (mapErrors.length) cy.log(`Known app bug on map click: ${mapErrors[0]}`); });
  });

  it('Data Availability: "Download Data" requests the Excel export for the current filters', () => {
    visitNational();
    cy.contains('app-data-availability button', 'Download Data').click();
    waitCall(nd, (c) => c.query.csv === 'true', 'csv export').then((c) => {
      expect(c.url).to.contain('/dashboard/national/data-availability');
      expect(c.query).to.include({ financialYear: years[1], formType: 'populationCategory' });
      expect(c.status).to.eq(200);
      expect(String(c.headers!['content-type'])).to.contain('spreadsheetml');
      expect(String(c.headers!['content-disposition'])).to.contain('attachment');
    });
    cy.window().its('__downloads').should((d: any[]) => {
      expect(d.map((x) => x.name)).to.include('CityFinance_Data Availability');
      expect(d[0].href).to.match(/^blob:/);
    });
  });

  // ------------------------------------------------- financial tabs --

  ['Revenue', 'Expenditure', 'Own Revenue', 'Capital Expenditure'].forEach((tabName) => {
    it(`${tabName} tab: description, every indicator button queries its API type and renders table / mix chart`, function () {
      const tab = tabs.find((t) => t.name === tabName);
      if (!tab) {
        cy.log(`Tab "${tabName}" not configured in dashboardHeaders on staging`);
        this.skip();
        return;
      }
      const slug = tabName.toLowerCase().replace(/\s+/g, '-');
      visitNational();
      cy.then(() => (nd.length = 0));
      openTab(tabName, nd);
      cy.get('app-financial-indicators > .position-relative > p').first().invoke('text')
        .then((t) => expect(norm(t)).to.eq(norm(tab.text || '')));
      cy.get('app-financial-indicators > .position-relative app-tab-buttons button').then(($b) => {
        expect([...$b].map((b) => norm(b.innerText))).to.deep.equal(tab.buttons.map((b) => b.trim()));
      });

      tab.buttons.forEach((btn, i) => {
        const type = BUTTON_TYPE[btn];
        if (i > 0) {
          cy.then(() => (nd.length = 0));
          cy.get('app-financial-indicators > .position-relative app-tab-buttons button').eq(i).click();
        }
        cy.get('app-financial-indicators > .position-relative app-tab-buttons button').eq(i).should('have.class', 'btn-cfPrimary');
        waitCall(nd, (c) => c.url.includes(`/national-dashboard/${slug}?`) && c.query.type === type, `${btn} → type=${type}`)
          .then((c) => {
            expect(c.status).to.eq(200);
            expect(c.query).to.include({ financialYear: years[1], formType: 'populationCategory', stateId: '', population: 'true' });
            tableSettled();
            if (btn.includes('Mix')) {
              const colours = c.body.data?.colourArray || [];
              if (!colours.length) {
                cy.contains('app-no-data-found', 'No Data Found for chosen options').should('be.visible');
                return;
              }
              cy.get('app-national-chart .legends li span', LONG).should(($s) => {
                expect([...$s].map((s) => norm(s.textContent || '')).sort())
                  .to.deep.equal(colours.map((x: any) => x.lineitem).sort());
              });
              cy.get('app-national-chart canvas').should('have.length', 1 + Object.keys(c.body.data.individual).length);
              cy.get('app-national-chart p.custom-font-size-7').first().should('have.text', 'National');
              cy.get('app-national-table mat-button-toggle-group').should('not.exist');
            } else {
              cy.get('app-national-table mat-button-toggle-group').should('be.visible');
              assertTable(c.body.data);
            }
          });
      });
    });
  });

  it('Revenue tab: Graph view draws the API categories, switches measure, and Table toggles back', function () {
    if (!tabs.find((t) => t.name === 'Revenue')) this.skip();
    visitNational();
    cy.then(() => (nd.length = 0));
    openTab('Revenue', nd);
    waitCall(nd, (c) => c.query.type === 'totalRevenue', 'total revenue').then((c) => {
      tableSettled();
      const rows = c.body.data.rows.filter((r: any) => r.ulb_pop_category && !['Average', 'All ULBs'].includes(r.ulb_pop_category));
      const avg = c.body.data.rows.find((r: any) => r.ulb_pop_category === 'Average');
      clearDrawn();
      cy.contains('mat-button-toggle', 'Graph').find('button').click();
      cy.contains('mat-button-toggle', 'Graph').should('have.class', 'mat-button-toggle-checked');
      cy.get('app-national-table table[mat-table]').should('not.exist');
      cy.get('app-national-chart canvas').should('be.visible');
      cy.get('app-national-chart mat-select').should('contain.text', 'Revenue');
      drawnShouldInclude([...rows.map((r: any) => r.ulb_pop_category), 'Revenue (in Cr)', 'Total Revenue']
        .concat(avg && Number(avg.revenue) ? ['National Average'] : []));

      // "Choose option" lists only this tab's measures.
      cy.get('app-national-chart mat-select').click();
      cy.get('mat-option').should(($o) => {
        expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.equal(GRAPH_OPTIONS.Revenue);
      });
      clearDrawn();
      cy.contains('mat-option', 'Revenue Per Capita').click();
      cy.get('app-national-chart mat-select').should('contain.text', 'Revenue Per Capita');
      drawnShouldInclude(['Revenue Per Capita (in Rs)']);

      cy.contains('mat-button-toggle', 'Table').find('button').click();
      assertTable(c.body.data);
    });
  });

  it('Revenue tab: ULB Type, year and state filters re-query the tab API; mix chart adds the state doughnut', function () {
    if (!tabs.find((t) => t.name === 'Revenue')) this.skip();
    cy.on('fail', (err) => {
      // Diagnostics for a rare stale-response race (see report).
      err.message += `\nCalls since last step: ${nd.map((c) => `${c.query.type}/${c.query.formType}/${c.query.financialYear}/${c.query.stateId}/${c.done ? c.body?.data?.columns?.[0]?.display_name : 'pending'}`).join(' ; ')}`;
      throw err;
    });
    visitNational();
    openTab('Revenue', nd);
    tableSettled();
    cy.then(() => (nd.length = 0));
    cy.contains('app-national-table app-tab-buttons button', 'ULB Type').click();
    waitCall(nd, (c) => c.query.formType === 'ulbType' && c.query.type === 'totalRevenue', 'ULB type').then((c) => {
      expect(c.query).to.include({ ulbType: 'true', population: '' });
      tableSettled();
      assertTable(c.body.data);
    });
    const target = years[2] || years[0];
    cy.then(() => (nd.length = 0));
    cy.get('app-national-table #state_years').select(target);
    waitCall(nd, (c) => c.query.financialYear === target, 'year').then((c) => {
      expect(c.query.formType).to.eq('ulbType');
      tableSettled();
      assertTable(c.body.data);
    });
    // State filter, then switch to Revenue Mix: doughnuts for National + the state.
    const state = states.find((s) => s.code === 'KA') || states[1];
    cy.then(() => (nd.length = 0));
    cy.get('app-national-table input#stateName').click({ force: true }).type(state.name.slice(0, 6), { force: true });
    cy.contains('mat-option', new RegExp(`^\\s*${state.name}\\s*$`), LONG).click();
    waitCall(nd, (c) => c.query.stateId === state._id, 'state filter').then((c) => {
      tableSettled();
      assertTable(c.body.data);
    });
    cy.contains('button', 'View State Dashboard').should('be.visible');
    cy.then(() => (nd.length = 0));
    cy.contains('app-financial-indicators > .position-relative app-tab-buttons button', 'Revenue Mix').click();
    waitCall(nd, (c) => c.query.type === 'revenueMix' && c.query.stateId === state._id, 'state mix').then((c) => {
      tableSettled();
      if (!c.body.data?.colourArray?.length) {
        cy.contains('app-no-data-found', 'No Data Found for chosen options').should('be.visible');
        return;
      }
      cy.get('app-national-chart p.custom-font-size-7').eq(0).should('have.text', 'National');
      cy.get('app-national-chart p.custom-font-size-7').eq(1).should('have.text', state.name);
    });
  });

  it('Expenditure tab: "Deficit or Surplus" graph has no measure dropdown and plots revenue vs expenditure', function () {
    if (!tabs.find((t) => t.name === 'Expenditure')?.buttons.includes('Deficit or Surplus')) this.skip();
    visitNational();
    openTab('Expenditure', nd);
    tableSettled();
    cy.then(() => (nd.length = 0));
    cy.contains('app-financial-indicators > .position-relative app-tab-buttons button', 'Deficit or Surplus').click();
    waitCall(nd, (c) => c.query.type === 'deficitOrSurplus', 'deficit').then((c) => {
      tableSettled();
      clearDrawn();
      cy.contains('mat-button-toggle', 'Graph').find('button').click();
      cy.get('app-national-chart canvas').should('be.visible');
      cy.get('app-national-chart mat-select').should('not.exist');
      const labels = c.body.data.rows
        .filter((r: any) => r.ulbType && !['Average', 'All ULBs'].includes(r.ulbType))
        .map((r: any) => r.ulbType);
      drawnShouldInclude(['Total Expenditure', ...labels]);
    });
  });

  ['Expenditure', 'Own Revenue', 'Capital Expenditure'].forEach((tabName) => {
    it(`${tabName} tab: graph "Choose option" offers only this tab's measures`, function () {
      if (!tabs.find((t) => t.name === tabName)) this.skip();
      visitNational();
      openTab(tabName, nd);
      tableSettled();
      cy.contains('mat-button-toggle', 'Graph').find('button').click();
      cy.get('app-national-chart mat-select').should('contain.text', GRAPH_OPTIONS[tabName][0]).click();
      cy.get('mat-option').should(($o) => {
        expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.equal(GRAPH_OPTIONS[tabName]);
      });
      clearDrawn();
      cy.contains('mat-option', GRAPH_OPTIONS[tabName][1]).click();
      // NOTE: "Capital Expenditure Per Capita" uses value 'perCapita', which national-chart.ts's
      // includes('PerCapita') check misses, so its axis reads "(in Cr)" — reported as an app bug.
      drawnShouldMatch(new RegExp(`^${GRAPH_OPTIONS[tabName][1]} \\(in (Rs|Cr)\\)$`));
    });
  });

  it('financial tab: the data-availability "link" jumps to the Data Availability tab', function () {
    if (!tabs.find((t) => t.name === 'Revenue')) this.skip();
    visitNational();
    openTab('Revenue', nd);
    cy.contains('p', 'Click here to view data availability for each financial year').find('a.link-primary').click();
    cy.get('.mdc-tab').eq(0).should('have.attr', 'aria-selected', 'true');
    cy.get('app-data-availability').should('exist');
  });

  it('financial tab: "Download Data" requests the Excel export from the tab endpoint', function () {
    if (!tabs.find((t) => t.name === 'Capital Expenditure')) this.skip();
    visitNational();
    openTab('Capital Expenditure', nd);
    tableSettled();
    cy.then(() => (nd.length = 0));
    cy.contains('app-national-table button', 'Download Data').click();
    waitCall(nd, (c) => c.query.csv === 'true', 'csv').then((c) => {
      expect(c.url).to.contain('/national-dashboard/capital-expenditure?');
      expect(c.query.type).to.eq('totalCapexpense');
      expect(c.status).to.eq(200);
      expect(String(c.headers!['content-type'])).to.contain('spreadsheetml');
      expect(String(c.headers!['content-disposition'])).to.contain('attachment');
    });
    cy.window().its('__downloads').should((d: any[]) => {
      expect(d.map((x) => x.name)).to.include('CityFinance_Capital Expenditure');
    });
  });

  // ------------------------------------------------------- resources --

  it('Resources tab: lists every resource from the API with its thumbnail and download link', function () {
    if (!tabs.find((t) => t.name === 'Resources')) this.skip();
    // APP BUG (staging): resources.ts sorts with `b?.modifiedAt.localeCompare(...)`, which
    // throws for resources without modifiedAt. Swallow only that error and record it.
    const sortErrors: string[] = [];
    cy.on('uncaught:exception', (e) => {
      if (/reading 'localeCompare'/.test(e.message)) {
        sortErrors.push(e.message);
        return false;
      }
      return true;
    });
    cy.intercept('GET', '**/api/v1/resource/all').as('resources');
    visitNational();
    openTab('Resources');
    cy.wait('@resources').then(({ response }) => {
      expect(response!.statusCode).to.eq(200);
      const items = response!.body.data.data;
      const toStorage = (v: string) =>
        !v ? '' : /^https?:\/\//i.test(v) ? v : 'https://jana-cityfinance-stg.s3.ap-south-1.amazonaws.com' + v;
      cy.get('app-resources .card-body').should('have.length', items.length);
      cy.get('app-resources .card-body').each(($c) => {
        const name = norm($c.find('a').text());
        const item = items.find((x: any) => x.name.trim() === name);
        expect(item, `resource "${name}"`).to.exist;
        expect($c.find('a').attr('href')).to.eq(toStorage(item.downloadUrl));
        expect($c.find('a').attr('target')).to.eq('_blank');
        expect($c.find('img').attr('src')).to.eq(toStorage(item.imageUrl));      });
      cy.then(() => {
        if (sortErrors.length) cy.log(`Known app bug — resources sort threw: ${sortErrors[0]}`);
      });
    });
  });

  // ---------------------------------------------- empty states (stubbed) --

  it('empty states (stubbed): no money-info, a table without columns and an empty mix show their no-data messages', function () {
    if (!tabs.find((t) => t.name === 'Revenue')) this.skip();
    // Stubs registered after beforeEach's recorders take precedence.
    cy.intercept('GET', /\/api\/v1\/dashboard\/financial-info\/get-data/, { body: { result: [] } }).as('noMoney');
    cy.intercept('GET', /\/api\/v1\/national-dashboard\/revenue\?.*type=totalRevenue/, {
      body: { success: true, data: { rows: [{ ulb_pop_category: 'All ULBs' }], columns: [] } },
    }).as('noCols');
    cy.intercept('GET', /\/api\/v1\/national-dashboard\/revenue\?.*type=revenueMix/, {
      body: { success: true, data: { state: {}, national: {}, individual: {}, colourArray: [] } },
    }).as('noMix');
    visitNational();
    cy.get('#national_years').select(years[2] || years[0]);
    cy.wait('@noMoney');
    cy.contains('app-info-cards .alert', 'Financial data is unavailable for selected entity.').should('be.visible');
    openTab('Revenue');
    cy.wait('@noCols');
    tableSettled();
    cy.get('app-national-table table[mat-table]').should('not.exist');
    cy.contains('app-no-data-found', 'No Data Found for chosen options').should('be.visible')
      .find('img').should('have.attr', 'src', './assets/images/sad.svg');
    cy.contains('app-financial-indicators > .position-relative app-tab-buttons button', 'Revenue Mix').click();
    cy.wait('@noMix');
    tableSettled();
    cy.get('app-national-chart').should('not.exist');
    cy.contains('app-no-data-found', 'No Data Found for chosen options').should('be.visible');
  });

  it('APP BUG: an empty rows[] response throws in setTable() and leaves the table loading', function () {
    if (!tabs.find((t) => t.name === 'Revenue')) this.skip();
    // national-table.ts#setTable does `this.dataSource[idx]['className'] = 'fw-bold'` with idx = -1.
    const errors: string[] = [];
    cy.on('uncaught:exception', (e) => {
      if (/setting 'className'/.test(e.message)) {
        errors.push(e.message);
        return false;
      }
      return true;
    });
    cy.intercept('GET', /\/api\/v1\/national-dashboard\/revenue\?.*type=totalRevenue/, {
      body: { success: true, data: { rows: [], columns: [] } },
    }).as('noRows');
    visitNational();
    openTab('Revenue');
    cy.wait('@noRows');
    cy.wrap(null, LONG).should(() => expect(errors, 'setTable TypeError').to.have.length.gte(1));
    cy.get('app-national-table table[mat-table]').should('not.exist');
    cy.log(`Reproduced: ${errors[0] || ''}`);
  });

  // ------------------------------------------------------ responsive --

  it('mobile (375px): header, cards, year filter and tabs render; the tab header paginates', () => {
    cy.viewport(375, 812);
    visitNational();
    cy.contains('h1', 'National Performance').should('be.visible');
    cy.get('app-national app-info-cards .card').first().should('be.visible');
    cy.get('.mat-mdc-tab-header-pagination-after').should('be.visible')
      .and('not.have.class', 'mat-mdc-tab-header-pagination-disabled').click();
    cy.get('.mat-mdc-tab-header-pagination-before').should('not.have.class', 'mat-mdc-tab-header-pagination-disabled');
    cy.get('#national_years').should('be.visible');
  });
});
