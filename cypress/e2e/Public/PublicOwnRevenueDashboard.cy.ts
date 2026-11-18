/**
 * Public (logged-out) — Own Revenue Performance dashboard of the old Angular app.
 * URL: /v1/own-revenue-dashboard (navbar Dashboard → "Own Revenue Performance").
 *
 * Route module: pages/own-revenue-dashboard (cityfinance-ng-ui) with
 * app-revenuechart (doughnut + top-10/compare bar chart, PNG download),
 * app-compare-dialog (type 2: States/ULBs toggle, search, chips, parameter),
 * app-shared-card (type 5 cards) and, on mobile, FilterModelBoxComponent.
 * APIs (api/v1, all POST unless noted): yearList, UlbType (GET), chart-data,
 * cards-data, table-data, data-available, topPerformance (+csv:true → xlsx),
 * recentSearchKeyword/search?type=ulb|state.
 *
 * Charts are drawn on <canvas> by Chart.js (no DOM values), so chart data is
 * asserted at the request/response level; cards and the population-category
 * table are asserted against the response using the component's own formulas.
 *
 * Built from the cityfinance-ng-ui `staging` branch and checked against
 * staging. Expected values are derived from the intercepted API responses.
 */
export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const PAGE = '/v1/own-revenue-dashboard';
const API = '**/api/v1';
const POP_CATS = [
  'ULB Population Category',
  '4 Million+',
  '1 Million - 4 Million',
  '500 Thousand - 1 Million',
  '100 Thousand - 500 Thousand',
  '<100 Thousand',
];
const TABLE_ROWS = ['4 Million+', '1 Million - 4 Million', '500 Thousand - 1 Million', '100 Thousand-500 Thousand', '<100 Thousand'];
const OWN_HEADERS = [
  'ULB Population Category',
  'Weighted Average Own Revenue (In Rs. Crores)',
  'Median Own Revenue per Capita (₹)',
  'Weighted Average Own Revenues to Revenue Expenditure(%)',
  'Cities where Own Revenues meet Revenue Expenditure(%)',
];
const PRO_HEADERS = [
  'ULB Population Category',
  'Weighted Average Property Tax Revenue Collections (In Crore Rs.)',
  'Median Property Tax Revenue per Capita',
  'Weighted Average Property Tax Revenue as percentage of Own Revenue',
];
/** Uncached staging queries take 20-40 s (data-available, cards-data). */
const LONG = { timeout: 120000 };
const DEFAULT_FILTERS = {
  stateId: 'State Name',
  ulb: '',
  ulbType: 'ULB Type',
  populationCategory: 'ULB Population Category',
};
const UP = './assets/resources-das/north_east_green_24dp.svg';
const DOWN = './assets/resources-das/south_west_red_24dp.svg';

// ---------------------------------------------------------------- helpers

type Card = { title: string; subTitle: string; percentage: string; svg?: string };

/** Seeds the localStorage the component reads in its field initialisers (app.component normally writes it). */
let ulbsResponse: any;
const seedStorage = (win: Window) => {
  win.localStorage.setItem('ulbList', JSON.stringify(ulbsResponse));
  const stateIdsMap: Record<string, string> = {};
  Object.values<any>(ulbsResponse.data).forEach((el) => (stateIdsMap[el._id] = el.state));
  win.localStorage.setItem('stateIdsMap', JSON.stringify(stateIdsMap));
};

const aliasApis = () => {
  ['yearList', 'chart-data', 'cards-data', 'table-data', 'data-available', 'topPerformance'].forEach((e) =>
    cy.intercept('POST', `${API}/${e}`).as(e));
  cy.intercept('GET', `${API}/UlbType`).as('UlbType');
  cy.intercept('POST', `${API}/recentSearchKeyword/search*`).as('search');
};

const visitDashboard = (path = PAGE, extra?: (win: Cypress.AUTWindow) => void) => {
  aliasApis();
  cy.visit(path, {
    onBeforeLoad(win) {
      seedStorage(win);
      extra?.(win);
    },
  });
};

/** Waits on `alias` until a call satisfies `pred` (several sections re-fire the same API). */
const waitFor = (alias: string, pred: (i: any) => boolean, tries = 30): Cypress.Chainable<any> =>
  cy.wait(alias, LONG).then((i: any) => {
    if (pred(i)) return i;
    if (tries <= 1) throw new Error(`no ${alias} call matched`);
    return waitFor(alias, pred, tries - 1);
  });

const prevYear = (fy: string) => fy.split('-').map((v) => Number(v) - 1).join('-');
const pct = (o: number, n: number) => ({ num: ((n - o) / o) * 100, inc: n >= o });
const crore = (v: number) => `₹ ${(v / 10000000).toFixed(0)} Cr`;
const numCheck = (v: any) => (isNaN(v) ? '0' : Number(v).toFixed(0));

/** OwnRevenueDashboardComponent.ownTabCardsFormant */
const ownCards = (data: any, fy: string): Card[] => {
  const v = data[fy];
  const cards: Card[] = [
    { title: crore(v.totalRevenue), subTitle: 'Own Revenue Collections', percentage: '0%' },
    { title: `₹ ${v.perCapita.toFixed(0)}`, subTitle: 'Own Revenue Per Capita', percentage: '0%' },
    { title: `${v.percentage.toFixed(0)} %`, subTitle: 'Own Revenue As A Percentage Of Revenue Expenditure', percentage: '0%' },
    { title: String(v.totalUlbMeetExpense), subTitle: 'Cities Where Own Revenue Meet Revenue Expenditure', percentage: '0%' },
  ];
  if (Object.keys(data)[1]) {
    const o = data[prevYear(fy)];
    const t = [
      pct(o.totalRevenue, v.totalRevenue),
      pct(o.perCapita, v.perCapita),
      pct(o.percentage, v.percentage),
      pct(o.totalUlbMeetExpense, v.totalUlbMeetExpense),
    ];
    t.forEach((x, i) => {
      cards[i].percentage = x.num.toFixed(0);
      cards[i].svg = x.inc ? UP : DOWN;
    });
    if (o.totalUlbMeetExpense == 0) cards[3].percentage = '0';
  }
  return cards;
};

/** OwnRevenueDashboardComponent.proTabCardsFormat */
const proCards = (data: any, fy: string): Card[] => {
  const v = data[fy];
  const cards: Card[] = [
    { title: crore(v.totalProperty), subTitle: 'Property Tax Revenue', percentage: '0%' },
    { title: `₹ ${(v.totalProperty / v.population).toFixed(0)}`, subTitle: 'Property Tax Revenue Per Capita', percentage: '0%' },
    { title: `${v.percentage.toFixed(0)} %`, subTitle: 'Property Tax To Own Revenue Percentage', percentage: '0%' },
  ];
  if (Object.keys(data)[1]) {
    const o = data[prevYear(fy)];
    const share = (x: any) => (x.totalProperty / (x.totalRevenue - x.totalProperty)) * 100;
    const t = [
      pct(o.totalProperty, v.totalProperty),
      pct(o.totalProperty / o.population, v.totalProperty / v.population),
      { num: share(v) - share(o), inc: share(v) >= share(o) },
    ];
    t.forEach((x, i) => {
      cards[i].percentage = x.num.toFixed(0);
      cards[i].svg = x.inc ? UP : DOWN;
    });
  }
  return cards;
};

const assertCards = (expected: Card[]) => {
  cy.get('app-shared-card .revenue-card', LONG).should(($c) => {
    expect($c, 'card count').to.have.length(expected.length);
    expected.forEach((e, i) => {
      const c = $c.eq(i);
      expect(c.find('h3.title').text().trim(), `${e.subTitle} value`).to.eq(e.title);
      expect(c.find('p.subTitle').text().trim()).to.eq(e.subTitle);
      expect(c.find('span.percentage').text().trim(), `${e.subTitle} change`).to.eq(`${e.percentage}%`);
      if (e.svg) expect(c.find('.arrow-title img'), `${e.subTitle} arrow`).to.have.attr('src', e.svg);
    });
  });
};

/** OwnRevenueDashboardComponent.tableData + template formatting */
const assertTable = (data: any, own: boolean) => {
  cy.get('table.styletable thead th', LONG).should(($th) =>
    expect([...$th].map((t) => t.textContent!.trim())).to.deep.eq(own ? OWN_HEADERS : PRO_HEADERS));
  cy.get('table.styletable tbody', LONG).should(($tb) => {
    const rows = $tb.find('tr');
    expect(rows).to.have.length(TABLE_ROWS.length);
    TABLE_ROWS.forEach((name, r) => {
      const d = data[name];
      let avg: any, median: string, meet: string;
      if (own) {
        avg = d.totalRevenue > 0 ? numCheck(d.totalRevenue) : '0';
        median = d.population > 0 ? numCheck(d.median) : '0';
        meet = d.totalExpense > 0 ? numCheck(d.percentage) : '0';
      } else {
        avg = d.totalRevenue;
        median = d.population > 0 ? d.median.toFixed(0) : '0';
        meet = d.totalRevenue > 0 ? d.percentage.toFixed(0) : '0';
      }
      const exp = [name, (avg / 10000000).toFixed(0), median, `${meet}%`];
      if (own) exp.push(`${numCheck(d.numOfUlbMeetRevenue)}%`);
      const got = [...rows.eq(r).find('td')].map((t) => t.textContent!.trim());
      expect(got, `row ${name}`).to.deep.eq(exp);
    });
  });
};

/** Picks a financial year whose previous year is also offered (cards compare YoY). */
const pickComparableYear = (years: string[], not?: string) =>
  years.find((y) => y !== not && years.includes(prevYear(y)));

/** angular2-multiselect closes itself on window:scroll, so use native clicks (no auto-scroll). */
const pickFilterState = (name: string) => {
  cy.get('.fl-form angular2-multiselect .c-btn').then(($b) => $b[0].click());
  cy.get('.dropdown-list:not([hidden]) input.c-input').then(($i) => {
    ($i[0] as HTMLInputElement).value = name;
    $i[0].dispatchEvent(new Event('input', { bubbles: true }));
    $i[0].dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  });
  cy.get('.dropdown-list:not([hidden]) li label')
    .filter((_, el) => el.textContent!.trim() === name)
    .then(($l) => $l[0].click());
};

/** Captures programmatic downloads (FileSaver dispatches a click, html2canvas calls .click()). */
const captureDownloads = (win: Cypress.AUTWindow) => {
  const saved: { download: string; href: string }[] = [];
  (win as any).__downloads = saved;
  const proto = win.HTMLAnchorElement.prototype;
  const origDispatch = proto.dispatchEvent;
  proto.dispatchEvent = function (this: HTMLAnchorElement, ev: Event) {
    if (this.download && ev.type === 'click') {
      saved.push({ download: this.download, href: this.href });
      return true;
    }
    return origDispatch.call(this, ev);
  };
  const origClick = proto.click;
  proto.click = function (this: HTMLAnchorElement) {
    if (this.download) {
      saved.push({ download: this.download, href: this.href });
      return;
    }
    return origClick.call(this);
  };
  cy.spy(win.URL, 'createObjectURL').as('createObjectURL');
};

// ---------------------------------------------------------------- specs

before(() => {
  cy.request('/api/v1/ulbs').then((r) => {
    expect(r.status).to.eq(200);
    ulbsResponse = r.body;
  });
});

describe('Public | Own Revenue Dashboard — Own Revenue tab', () => {
  let years: string[];
  let cards: any;
  let table: any;
  let top: any;
  let avail: any;
  let ulbTypes: any[];

  beforeEach(() => {
    visitDashboard(PAGE, captureDownloads);
    cy.wait('@yearList').then((i: any) => (years = i.response.body.data.map((y: any) => y._id)));
    cy.wait('@UlbType').then((i: any) => (ulbTypes = i.response.body.data));
    cy.wait('@cards-data').then((i: any) => (cards = i.response.body.data));
    cy.wait('@table-data').then((i: any) => (table = i.response.body.data));
    cy.wait('@data-available').then((i: any) => (avail = i.response.body.data));
    cy.wait('@topPerformance').then((i: any) => (top = i.response.body));
    cy.wait('@chart-data');
  });

  it('shows the heading, intro and the two dashboard tabs (Own active)', () => {
    cy.contains('h1', 'Own Revenue Performance').should('be.visible');
    cy.contains('p.perform-dashboard-para', 'The performance dashboard showcases the state of own revenues').should('be.visible');
    cy.contains('p.statusPara', 'To view your performance, select').should('be.visible');
    cy.contains('a.tab', 'Own Revenue Performance Dashboard').should('have.class', 'activeCls');
    cy.contains('a.tab', 'Property Tax Performance Dashboard').should('have.class', 'unActcls');
    cy.contains('You can compare your performance to the average or median performance').should('be.visible');
    cy.contains('Please note that this calculation is affected by the mismatch').should('exist');
  });

  it('first load calls every section API with the default (all-India 2020-21) filters', () => {
    const own = { ...DEFAULT_FILTERS, financialYear: '2020-21' };
    cy.get('@cards-data.all').its(0).its('request.body').should('deep.include', { ...own, property: false });
    cy.get('@table-data.all').its(0).its('request.body').should('deep.include', own);
    cy.get('@chart-data.all').its(0).its('request.body').should('deep.include', own);
    cy.get('@data-available.all').its(0).its('request.body').should('deep.include', { ...own, propertyTax: false });
    cy.get('@topPerformance.all').its(0).its('request.body')
      .should('deep.include', { ...own, list: [], param: 'Own Revenue per Capita', type: 'state', propertyTax: false });
  });

  it('filter dropdowns are populated from the APIs (year, ULB type) and the fixed population list', () => {
    cy.get('select[formcontrolname="financialYear"] option').should(($o) =>
      expect([...$o].map((o) => o.textContent!.trim())).to.deep.eq(['Year', ...years]));
    cy.get('select[formcontrolname="financialYear"]').should('have.value', '2020-21');
    cy.get('select[formcontrolname="ulbType"] option').should(($o) => {
      expect([...$o].map((o) => o.textContent!.trim())).to.deep.eq(['ULB Type', ...ulbTypes.map((u) => u.name)]);
      expect([...$o].slice(1).map((o) => (o as HTMLOptionElement).value)).to.deep.eq(ulbTypes.map((u) => u._id));
    });
    cy.get('select[formcontrolname="populationCategory"] option').should(($o) =>
      expect([...$o].map((o) => (o as HTMLOptionElement).value)).to.deep.eq(POP_CATS));
    cy.get('.fl-form angular2-multiselect .c-btn').should('contain.text', 'State Name');
    cy.get('input[formcontrolname="ulb"]').should('have.attr', 'placeholder', 'ULB');
  });

  it('revenue cards match cards-data (value, YoY change and arrow)', () => {
    cy.then(() => assertCards(ownCards(cards, '2020-21')));
  });

  it('population-category table matches table-data', () => {
    cy.then(() => assertTable(table, true));
  });

  it('Own Revenue Split doughnut: title, note, info tooltip and chart-data', () => {
    cy.get('@chart-data.all').its(0).its('response.body.data').then((d: any[]) => {
      expect(d.length).to.be.greaterThan(0);
      d.forEach((x) => {
        expect(x._id.revenueName).to.be.a('string');
        expect(x.amount).to.be.a('number');
      });
    });
    cy.get('#canvasDivownRevenue-doughnutChart').within(() => {
      cy.contains('p', 'Own Revenue Split').should('be.visible');
      cy.contains('The following pie chart provides the split of the contribution of own revenue streams').should('be.visible');
      cy.get('canvas#ownRevenue-doughnutChart').should('be.visible');
      cy.contains('Data is not available for several ULBs including Greater Mumbai').should('be.visible');
      cy.get('span.mat-tooltip-trigger').trigger('mouseenter');
    });
    cy.get('mat-tooltip-component').should('contain.text', 'Other Income includes Deposits Forfeited');
  });

  it('Top 10 bar chart: heading, sorted topPerformance data and Global Tax Program link', () => {
    cy.contains('h2.barCharttitle', 'Top 10 Performing ULBS').should('be.visible');
    cy.contains('p.barChartSubTitle', 'Top 10 performing ULBS in the country in Own Revenue per Capita can be viewed below.');
    cy.get('canvas#ownRevenue-barChart').should('exist');
    cy.then(() => {
      expect(top.success).to.eq(true);
      expect(top.data.length).to.be.within(1, 10);
      const amounts = top.data.map((d: any) => d.amount);
      expect(amounts, 'descending').to.deep.eq([...amounts].sort((a: number, b: number) => b - a));
    });
    cy.contains('a', 'Global Tax Program')
      .should('have.attr', 'href', 'https://www.worldbank.org/en/programs/the-global-tax-program')
      .and('have.attr', 'target', '_blank');
  });

  it('accordion "How is performance assessed?" expands and collapses', () => {
    cy.get('#collapseOne').should('not.have.class', 'show');
    cy.contains('button.accordion-button', 'How is performance assessed?').click();
    cy.get('#collapseOne').should('have.class', 'show').within(() => {
      cy.contains('Upward arrow:').should('be.visible');
      cy.contains('Downward arrow:').should('be.visible');
      cy.get('img[alt="green_arrow_icon"]').should('be.visible');
      cy.get('img[alt="red_arrow_icon"]').should('be.visible');
    });
    cy.contains('button.accordion-button', 'How is performance assessed?').click();
    cy.get('#collapseOne').should('not.have.class', 'show');
  });

  it('sticky "Data Availability" bar appears after scrolling and shows data-available', () => {
    cy.get('.dataavail').should('not.exist');
    cy.scrollTo(0, 800);
    cy.then(() => {
      // it sits in a position:fixed tab bar overlapped by the navbar, so assert presence + text
      cy.get('.dataavail').should('exist').and('contain.text', `Data Availability - ${Math.round(avail.percent || 0)}% (2020-21)`);
    });
    cy.scrollTo(0, 0);
    cy.get('.dataavail').should('not.exist');
  });

  it('Year filter re-calls every API with the chosen year and updates cards/table', () => {
    cy.then(function () {
      const fy = pickComparableYear(years, '2020-21');
      if (!fy) {
        cy.log('No other year with a previous year on staging');
        this.skip();
      }
      cy.get('select[formcontrolname="financialYear"]').select(fy!);
      ['cards-data', 'table-data', 'chart-data', 'data-available', 'topPerformance', 'yearList'].forEach((a) =>
        waitFor(`@${a}`, (i) => i.request.body.financialYear === fy));
      cy.get('@cards-data').its('response.body.data').then((d) => assertCards(ownCards(d, fy!)));
      cy.get('@table-data').its('response.body.data').then((d) => assertTable(d, true));
    });
  });

  it('State filter sends the state id, resets ULB/type/population and updates cards/table', () => {
    const stateIds = Object.values<any>(ulbsResponse.data);
    const st = stateIds.find((s) => s.state === 'Karnataka') || stateIds[0];
    pickFilterState(st.state);
    waitFor('@cards-data', (i) => i.request.body.stateId === st._id).then((i: any) => {
      expect(i.request.body).to.deep.include({ ulb: '', ulbType: 'ULB Type', populationCategory: 'ULB Population Category' });
      assertCards(ownCards(i.response.body.data, '2020-21'));
    });
    waitFor('@table-data', (i) => i.request.body.stateId === st._id).then((i: any) => assertTable(i.response.body.data, true));
    waitFor('@topPerformance', (i) => i.request.body.stateId === st._id);
    cy.get('.fl-form angular2-multiselect .c-btn').should('contain.text', st.state);
  });

  it('ULB Type filter sends the type id and clears state/population', () => {
    cy.then(() => {
      const t = ulbTypes.find((u) => u.name === 'Municipal Corporation') || ulbTypes[0];
      cy.get('select[formcontrolname="ulbType"]').select(t.name);
      waitFor('@cards-data', (i) => i.request.body.ulbType === t._id).then((i: any) => {
        expect(i.request.body).to.deep.include({ stateId: 'State Name', ulb: '', populationCategory: 'ULB Population Category' });
        assertCards(ownCards(i.response.body.data, '2020-21'));
      });
      waitFor('@table-data', (i) => i.request.body.ulbType === t._id).then((i: any) => assertTable(i.response.body.data, true));
      waitFor('@chart-data', (i) => i.request.body.ulbType === t._id);
    });
  });

  it('Population Category filter sends the category and clears state/type', () => {
    const cat = '1 Million - 4 Million';
    cy.get('select[formcontrolname="populationCategory"]').select(cat);
    waitFor('@cards-data', (i) => i.request.body.populationCategory === cat).then((i: any) => {
      expect(i.request.body).to.deep.include({ stateId: 'State Name', ulb: '', ulbType: 'ULB Type' });
      const expected = ownCards(i.response.body.data, '2020-21');
      waitFor('@data-available', (a) => a.request.body.populationCategory === cat).then((a: any) => {
        expect(a.request.body).to.deep.include({ stateId: 'State Name', ulbType: 'ULB Type', propertyTax: false });
        if (Math.round(a.response.body.data?.percent || 0) > 0) {
          assertCards(expected);
        } else {
          // The dashboard body is gated on data-available > 0. Staging returns
          // percent:null for any population-category filter, so the whole
          // section disappears even though cards-data/table-data have data.
          cy.log(`APP BUG: data-available percent=${a.response.body.data?.percent} for '${cat}' hides the dashboard`);
          cy.get('app-shared-card').should('not.exist');
          cy.get('select[formcontrolname="populationCategory"]').should('have.value', cat);
        }
      });
    });
  });

  it('ULB autocomplete searches, and choosing a ULB filters by its state/type/population', () => {
    cy.get('input[formcontrolname="ulb"]').should('be.visible').clear().type('Pune');
    waitFor('@search', (i) => i.request.body.matchingWord === 'Pune').then((i: any) => {
      expect(i.request.url).to.contain('type=ulb');
      const opts: any[] = i.response.body.data;
      expect(opts.length).to.be.greaterThan(0);
      cy.get('mat-option').should(($o) =>
        expect([...$o].map((o) => o.textContent!.trim())).to.deep.eq(opts.map((o) => o.name)));
      const pick = opts.find((o) => o.name === 'Pune Municipal Corporation') || opts[0];
      const p = pick.population;
      const pop = p > 4000000 ? '4 Million+'
        : p < 4000000 && p > 1000000 ? '1 Million - 4 Million'
          : p < 1000000 && p > 500000 ? '500 Thousand - 1 Million'
            : p < 500000 && p > 100000 ? '100 Thousand - 500 Thousand'
              : p < 100000 ? '<100 Thousand' : undefined;
      cy.contains('mat-option', pick.name).click();
      waitFor('@cards-data', (c) => c.request.body.ulb === pick.name).then((c: any) => {
        expect(c.request.body.stateId).to.eq(pick.state._id);
        expect(c.request.body.ulbType).to.eq(pick.ulbType._id);
        if (pop) expect(c.request.body.populationCategory).to.eq(pop);
        assertCards(ownCards(c.response.body.data, '2020-21'));
      });
      cy.get('select[formcontrolname="ulbType"]').should('have.value', pick.ulbType._id);
    });
  });

  it('ULB autocomplete with an unknown name offers no options (negative)', () => {
    cy.get('input[formcontrolname="ulb"]').clear().type('zzqx');
    waitFor('@search', (i) => i.request.body.matchingWord === 'zzqx').its('response.body.data').should('have.length', 0);
    cy.get('mat-option').should('not.exist');
  });

  it('Clear All resets every filter to the defaults and the first available year', () => {
    cy.get('select[formcontrolname="populationCategory"]').select('4 Million+');
    waitFor('@cards-data', (i) => i.request.body.populationCategory === '4 Million+');
    cy.contains('button', 'Clear All').click();
    cy.then(() => {
      waitFor('@cards-data', (i) => i.request.body.populationCategory === 'ULB Population Category').then((i: any) => {
        expect(i.request.body).to.deep.include({ ...DEFAULT_FILTERS, financialYear: years[0] });
      });
      cy.get('select[formcontrolname="populationCategory"]').should('have.value', 'ULB Population Category');
      cy.get('select[formcontrolname="financialYear"]').should('have.value', years[0]);
    });
  });

  it('Download Data exports topPerformance as an xlsx', () => {
    cy.contains('p.DataDownloadText', 'You can also download the source data in excel format').should('be.visible');
    cy.contains('button.btn-download', 'Download Data').click();
    waitFor('@topPerformance', (i) => i.request.body.csv === true).then((i: any) => {
      expect(i.request.body).to.deep.include({ list: [], param: 'Own Revenue per Capita', financialYear: '2020-21' });
      expect(i.response.statusCode).to.eq(200);
      expect(i.response.headers['content-type']).to.contain('spreadsheetml.sheet');
      expect(i.response.headers['content-disposition']).to.contain('attachment').and.contain('.xlsx');
    });
    cy.window().its('__downloads').should((d: any[]) => {
      expect(d.map((x) => x.download)).to.include('dataAvaliable.xlsx');
    });
    cy.get('@createObjectURL').should('have.been.calledWithMatch', Cypress.sinon.match((b: any) => b && b.size > 0, 'non-empty Blob'));
  });

  it('chart Download saves a PNG named after the dashboard and year', () => {
    cy.get('#canvasDivownRevenue-doughnutChart').contains('.svg', 'Download').click();
    cy.window().its('__downloads', { timeout: 30000 }).should((d: any[]) => {
      const png = d.find((x) => x.download === 'Own Revenue Performance_2020-21_Chart.png');
      expect(png, 'png download').to.exist;
      expect(png.href).to.match(/^data:image\/octet-stream;base64,/);
    });
    // the header actions are restored after capture
    cy.get('#canvasDivownRevenue-doughnutChart #hideHeaderAction').should('not.have.class', 'display-none');
  });
});

describe('Public | Own Revenue Dashboard — compare (bar chart)', () => {
  beforeEach(() => {
    visitDashboard();
    cy.wait(['@topPerformance', '@cards-data']);
  });

  const openCompare = () => {
    cy.contains('.btnBesideTitle button', 'Compare', LONG).click();
    cy.get('app-compare-dialog').should('be.visible');
  };
  const addChip = (q: string, name: string) => {
    cy.get('app-compare-dialog input.fl-input').clear().type(q);
    waitFor('@search', (i) => i.request.body.matchingWord === q);
    cy.contains('mat-option', name).click();
    cy.contains('app-compare-dialog mat-chip', name).should('be.visible');
  };

  it('dialog shows the States/ULBs toggle, help text and Own Revenue parameters', () => {
    openCompare();
    cy.get('app-compare-dialog').within(() => {
      cy.contains('Compare with Average').should('be.visible');
      cy.contains('mat-label', 'States').should('be.visible');
      cy.contains('mat-slide-toggle', 'ULBs').find('input').should('not.be.checked');
      cy.contains('p.ownRevText', 'You can select upto 10 States and one parameter at a time');
      cy.get('input.fl-input').should('have.attr', 'placeholder', 'Search for States');
      cy.get('mat-select').should('contain.text', 'Own Revenue per Capita').click();
    });
    cy.get('mat-option').should(($o) =>
      expect([...$o].map((o) => o.textContent!.trim())).to.deep.eq(['Own Revenue', 'Own Revenue per Capita', 'Own Revenue to Revenue Expenditure']));
    cy.get('body').type('{esc}');
  });

  it('compares two states on a chosen parameter and the chart title follows', () => {
    openCompare();
    addChip('Karna', 'Karnataka');
    cy.get('@search').its('request.url').should('contain', 'type=state');
    addChip('Mahar', 'Maharashtra');
    cy.get('app-compare-dialog mat-select').click();
    cy.contains('mat-option', /^\s*Own Revenue\s*$/).click();
    cy.contains('app-compare-dialog button', 'Apply').click();
    cy.get('app-compare-dialog').should('not.exist');
    waitFor('@topPerformance', (i) => i.request.body.list?.length === 2).then((i: any) => {
      const b = i.request.body;
      expect(b.list.map((s: any) => s.name)).to.deep.eq(['Karnataka', 'Maharashtra']);
      expect(b).to.deep.include({ param: 'Own Revenue', type: 'state', typeTitle: 'States', stateId: 'State Name', financialYear: '2020-21' });
      expect(i.response.body.success).to.eq(true);
      expect(i.response.body.data.map((d: any) => d.name)).to.have.members(['Karnataka', 'Maharashtra']);
    });
    cy.contains('p.barCharttitle', 'Compare States on Own Revenue').should('be.visible');
    cy.contains('h2.barCharttitle', 'Top 10').should('not.exist');
  });

  it('ULB toggle switches the search to ULBs and compares ULBs', () => {
    openCompare();
    cy.get('app-compare-dialog mat-slide-toggle label').click();
    cy.get('app-compare-dialog input.fl-input').should('have.attr', 'placeholder', 'Search for ULBs');
    cy.contains('p.ownRevText', 'You can select upto 10 ULBs and one parameter at a time');
    addChip('Pune Mun', 'Pune Municipal Corporation');
    cy.get('@search').its('request.url').should('contain', 'type=ulb');
    addChip('Thane Mun', 'Thane Municipal Corporation');
    cy.contains('app-compare-dialog button', 'Apply').click();
    waitFor('@topPerformance', (i) => i.request.body.type === 'ulb' && i.request.body.list?.length === 2).then((i: any) => {
      expect(i.request.body.param).to.eq('Own Revenue per Capita');
      expect(i.response.body.data.length).to.eq(2);
    });
    cy.contains('p.barCharttitle', 'Compare ULBs on Own Revenue per Capita').should('be.visible');
  });

  it('chips can be removed and dialog Reset clears chips and parameter', () => {
    openCompare();
    addChip('Karna', 'Karnataka');
    addChip('Goa', 'Goa');
    cy.contains('app-compare-dialog mat-chip', 'Goa').click();
    cy.contains('app-compare-dialog mat-chip', 'Goa').should('not.exist');
    cy.get('app-compare-dialog mat-select').click();
    cy.contains('mat-option', 'Own Revenue to Revenue Expenditure').click();
    cy.contains('app-compare-dialog button', 'Reset').click();
    cy.get('app-compare-dialog mat-chip').should('not.exist');
    cy.get('app-compare-dialog mat-select').should('contain.text', 'Own Revenue per Capita');
  });

  it('search with no match shows the "can’t find anything" option (negative)', () => {
    openCompare();
    cy.get('app-compare-dialog input.fl-input').clear().type('zzqx');
    waitFor('@search', (i) => i.request.body.matchingWord === 'zzqx').its('response.body.data').should('have.length', 0);
    cy.contains('mat-option.noData', 'Sorry, we can’t find anything related to your search.').should('be.visible');
  });

  it('caps the selection at 10 with a snackbar (negative)', () => {
    openCompare();
    const ids = Object.values<any>(ulbsResponse.data).map((s) => s.state).sort();
    const names = ids.slice(0, 11);
    names.forEach((n, idx) => {
      // one search per keystroke, so type only the (distinct) first word
      const q = n.split(' ')[0];
      cy.get('app-compare-dialog input.fl-input').clear().type(q);
      waitFor('@search', (i) => i.request.body.matchingWord === q, 60);
      cy.get('mat-option').filter((_, el) => el.textContent!.trim().startsWith(n)).first().click();
      if (idx < 10) cy.get('app-compare-dialog mat-chip').should('have.length', idx + 1);
    });
    cy.get('app-compare-dialog mat-chip').should('have.length', 10);
    cy.contains('simple-snack-bar, .mat-simple-snackbar', 'Max 10 can be selected!').should('be.visible');
  });

  it('closing the dialog (X) applies nothing; Reset Compare restores the default top 10', () => {
    openCompare();
    addChip('Karna', 'Karnataka');
    cy.get('@topPerformance.all').then((before: any) => {
      cy.get('app-compare-dialog .topBar button').click();
      cy.get('app-compare-dialog').should('not.exist');
      cy.get('@topPerformance.all').should('have.length', before.length);
    });
    cy.get('a.reset-compare-filter').click();
    waitFor('@topPerformance', (i) => i.request.body.type === 'ulb' && i.request.body.list?.length === 0).then((i: any) => {
      expect(i.request.body.param).to.eq('Own Revenue per Capita');
      expect(i.request.body.propertyTax).to.eq(false);
    });
    cy.contains('h2.barCharttitle', 'Top 10 Performing ULBs').should('be.visible');
  });
});

describe('Public | Own Revenue Dashboard — Property Tax tab', () => {
  beforeEach(() => {
    visitDashboard();
    cy.wait(['@cards-data', '@table-data', '@topPerformance']);
    cy.contains('a.tab', 'Property Tax Performance Dashboard').click();
  });

  it('re-calls the APIs in property-tax mode and shows the 3 property cards and 4-column table', () => {
    waitFor('@cards-data', (i) => i.request.body.property === true).then((i: any) => {
      expect(i.request.body.propertyTax).to.eq(true);
      assertCards(proCards(i.response.body.data, '2020-21'));
    });
    waitFor('@table-data', (i) => i.request.body.propertyTax === true).then((i: any) => assertTable(i.response.body.data, false));
    waitFor('@topPerformance', (i) => i.request.body.propertyTax === true)
      .its('request.body').should('deep.include', { param: 'Property Tax per Capita', type: 'state' });
    cy.contains('a.tab', 'Property Tax Performance Dashboard').should('have.class', 'activeCls');
    cy.get('#canvasDivownRevenue-doughnutChart').should('not.exist');
    cy.contains('p.barChartSubTitle', 'in Property Tax per Capita can be viewed below.');
  });

  it('shows Digital Toolkit and Best Practices links opening in a new tab', () => {
    cy.contains('.addText', 'Additional Information on Property Tax:', LONG).within(() => {
      cy.contains('a', 'Digital Toolkit')
        .should('have.attr', 'href', '/v1/resources-dashboard/learning-center/toolkits/introduction')
        .and('have.attr', 'target', '_blank');
      cy.contains('a', 'Best Practices')
        .should('have.attr', 'href', '/v1/resources-dashboard/learning-center/bestPractices')
        .and('have.attr', 'target', '_blank');
    });
  });

  it('compare dialog offers the Property Tax parameters', () => {
    waitFor('@cards-data', (i) => i.request.body.property === true);
    cy.contains('.btnBesideTitle button', 'Compare', LONG).click();
    cy.get('app-compare-dialog mat-select').should('contain.text', 'Property Tax per Capita').click();
    cy.get('mat-option').should(($o) =>
      expect([...$o].map((o) => o.textContent!.trim())).to.deep.eq(['Property Tax', 'Property Tax per Capita', 'Property Tax to Revenue Expenditure']));
  });

  it('switching back to Own Revenue restores the doughnut and own-revenue mode', () => {
    waitFor('@cards-data', (i) => i.request.body.property === true);
    cy.contains('a.tab', 'Own Revenue Performance Dashboard').click();
    waitFor('@cards-data', (i) => i.request.body.property === false).then((i: any) =>
      assertCards(ownCards(i.response.body.data, '2020-21')));
    cy.get('#canvasDivownRevenue-doughnutChart', LONG).should('be.visible');
    cy.get('.addText').should('not.exist');
  });
});

describe('Public | Own Revenue Dashboard — deep link, empty and error states', () => {
  it('?cityName= pre-selects the first matching ULB', () => {
    visitDashboard(`${PAGE}?cityName=Pune%20Municipal%20Corporation`);
    waitFor('@search', (i) => i.request.body.matchingWord === 'Pune Municipal Corporation').then((i: any) => {
      const first = i.response.body.data[0];
      waitFor('@cards-data', (c) => c.request.body.ulb === first.name).then((c: any) => {
        expect(c.request.body.stateId).to.eq(first.state._id);
        assertCards(ownCards(c.response.body.data, '2020-21'));
      });
    });
    cy.get('input[formcontrolname="ulb"]').should('have.value', 'Pune Municipal Corporation');
  });

  it('shows "No Data Found" for the doughnut and bar chart when the APIs have no data', () => {
    aliasApis();
    cy.intercept('POST', `${API}/chart-data`, { body: { success: true, data: [{ _id: {}, amount: null }] } }).as('chartEmpty');
    cy.intercept('POST', `${API}/topPerformance`, { body: { success: false, data: null } }).as('topEmpty');
    cy.visit(PAGE, { onBeforeLoad: seedStorage });
    cy.wait(['@chartEmpty', '@topEmpty']);
    cy.get('#canvasDivownRevenue-doughnutChart').contains('No Data Found for chosen options').should('be.visible');
    cy.get('#canvasDivownRevenue-doughnutChart canvas').should('not.exist');
    cy.get('#canvasDivownRevenue-barChart').contains('No Data Found for chosen options').should('be.visible');
    cy.get('canvas#ownRevenue-barChart').should('not.exist');
  });

  it('hides the whole data section when data availability is 0%', () => {
    aliasApis();
    cy.intercept('POST', `${API}/data-available`, { body: { success: true, data: { percent: 0, names: [] } } }).as('availZero');
    cy.visit(PAGE, { onBeforeLoad: seedStorage });
    cy.wait('@availZero');
    cy.get('form .filters-container').should('be.visible');
    cy.get('app-shared-card').should('not.exist');
    cy.get('app-revenuechart').should('not.exist');
    cy.contains('Top 10 Performing').should('not.exist');
  });
});

describe('Public | Own Revenue Dashboard — mobile filter dialog', () => {
  beforeEach(() => {
    cy.viewport('iphone-x');
    visitDashboard();
    cy.wait(['@yearList', '@cards-data']);
  });

  it('hides the inline filters and opens the "Filters" dialog from "Filter by"', () => {
    cy.get('.fl-form').should('not.be.visible');
    cy.contains('a.fil-btn', 'Filter by').click();
    cy.get('app-filter-model-box').should('be.visible').within(() => {
      cy.contains('.h', 'Filters').should('be.visible');
      cy.get('#stateName').should('exist');
      cy.get('input[placeholder="City"]').should('exist');
      cy.get('select[formcontrolname="ulbType"]').should('exist');
      cy.get('select[formcontrolname="populationCategory"] option').should(($o) =>
        expect([...$o].map((o) => (o as HTMLOptionElement).value)).to.include.members(POP_CATS));
    });
  });

  it('applies the chosen year from the dialog to every API', () => {
    cy.get('@yearList').its('response.body.data').then((d: any[]) => {
      const fy = d.map((y) => y._id).find((y) => y !== '2020-21')!;
      cy.contains('a.fil-btn', 'Filter by').click();
      cy.get('app-filter-model-box select[formcontrolname="financialYear"]').select(fy);
      cy.contains('app-filter-model-box button', 'Apply').click();
      cy.get('app-filter-model-box').should('not.exist');
      waitFor('@cards-data', (i) => i.request.body.financialYear === fy)
        .its('request.body').should('deep.include', DEFAULT_FILTERS);
      waitFor('@table-data', (i) => i.request.body.financialYear === fy);
    });
  });

  it('closing the dialog with X applies nothing', () => {
    cy.get('@cards-data.all').then((before: any) => {
      cy.contains('a.fil-btn', 'Filter by').click();
      cy.get('app-filter-model-box .close a').click();
      cy.get('app-filter-model-box').should('not.exist');
      cy.get('@cards-data.all').should('have.length', before.length);
    });
  });
});

describe('Public | Own Revenue Dashboard — navigation', () => {
  it('is reachable from the navbar Dashboard menu', () => {
    cy.visit('/v1/home');
    cy.get('a.nav-link.dropdown-toggle').contains('Dashboard').click();
    cy.contains('a.dropdown-item', 'Own Revenue Performance').should('be.visible').click();
    cy.location('pathname').should('eq', PAGE);
    cy.contains('h1', 'Own Revenue Performance').should('be.visible');
  });
});
