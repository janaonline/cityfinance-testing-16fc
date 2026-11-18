/**
 * Public (logged-out) City Compare page.
 * URL: /municipal-data/city/comparewith?cities=<slug>[&cities=..][&years=YYYY-YY..][&indicator=<key>]
 *
 * Reached from the city dashboard's "Compare with different cities" button
 * (navigates with ?cities=<current slug>). The page re-reads the query params
 * (cities = ULB slugs → ledger/getUlbDetailsById, years, indicator) and loads
 * ledger/getCompareByIndicators. Its own Apply / sample buttons write the
 * selection back to the query string.
 *
 * Built from cf-ui-ssr-v3 `staging` (pages/dashboard/city/financial-performance/
 * compare/*) and checked against staging. Read-only (search POSTs are lookups;
 * the averages chart is a POST query). Expected values come from intercepted
 * API responses; only static UI text is hard-coded.
 */
export {}; // Own module scope so top-level names don't collide across specs.

// Staging can be slow to answer on first load (applies to this spec only).
Cypress.config('requestTimeout', 30000);
Cypress.config('defaultCommandTimeout', 15000);

// Known app bug: the page calls getCompareByIndicators with missing params on
// load (no cities/years/indicator) and the 400 surfaces as an uncaught
// HttpErrorResponse, sometimes after a test body has finished. Ignore only that.
const ignoreCompare400 = (e: Error) => !/getCompareByIndicators[\s\S]*400/.test(String(e?.message ?? e));
Cypress.on('uncaught:exception', ignoreCompare400);

const PAGE = '/municipal-data/city/comparewith';
const YEARS = ['2020-21', '2021-22', '2022-23']; // compare.ts yearsArr (static in source)
const SAMPLES = [
  { id: 'mumbai-bengaluru-pune-receipts', text: ['3Y Own Revenue Data', 'for Mumbai–Bengaluru–Pune'], cities: ['mumbai', 'bengaluru', 'pune'], indicator: 'receipts' },
  { id: 'ahmedabad-surat-indore-taxRevenue', text: ['3Y Property Tax', 'of Ahmedabad–Surat–Indore'], cities: ['amdavad', 'surat', 'indore'], indicator: 'taxRevenue' },
  { id: 'mumbai-indore-hyderabad-debt', text: ['3Y Debt Data', 'of Mumbai–Indore–Hyderabad'], cities: ['mumbai', 'indore', 'hyderabad'], indicator: 'debt' },
];

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Mirror of inrFormat 'cr' with { showSymbol: true, showUnit: false } (max 0 decimals). */
const cr = (v: number) => `₹ ${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
/** Mirror of the compare table cell template. */
function cellText(v: any): string {
  if (!isNaN(+v) && v !== null && v !== '' && typeof v !== 'boolean') {
    return +v % 1 === 0 ? cr(+v) : `${v}%`;
  }
  return String(v ?? '');
}

function snackbar(msg: string) {
  cy.contains('.mat-mdc-snack-bar-label', msg).should('be.visible');
}

/** Intercepts; getUlbDetailsById is held until the indicator list has loaded so the
 * page's (racy) query-param hydration is deterministic — see report. */
function interceptAll() {
  let release: () => void;
  const indicatorsLoaded = new Promise<void>((r) => (release = r));
  cy.intercept('GET', '**/api/v1/ledger/getIndicatorsNameCompareByPage', (req) => {
    req.on('after:response', () => release());
  }).as('indicatorList');
  // Hold only the *response* (the request itself goes out immediately) until the
  // indicator list has been delivered to the page.
  cy.intercept('GET', '**/api/v1/ledger/getUlbDetailsById*', (req) => {
    req.continue(() => indicatorsLoaded);
  }).as('ulbDetails');
  cy.intercept('GET', '**/api/v1/ledger/getCompareByIndicators*').as('compare');
  // Separate alias for the complete (keyType-bearing) compare call.
  cy.intercept('GET', '**/api/v1/ledger/getCompareByIndicators*', (req) => {
    if (req.url.includes('keyType=')) req.alias = 'compareKeyed';
  });
  cy.intercept('POST', '**/api/v1/recentSearchKeyword/searchMarketDashboard*').as('search');
  // Per-term alias so a test waits for the search it triggered.
  cy.intercept('POST', '**/api/v1/recentSearchKeyword/searchMarketDashboard*', (req) => {
    req.alias = `search_${req.body?.matchingWord}`;
  });
}

function chip(label: string) {
  return cy.get(`small[title="${label}"]`);
}

/** Search the "Search for ULB" box and pick the option containing `name`. */
function addCity(term: string, name: string) {
  // force: the floating mat-label overlays the empty input of the same control.
  cy.get('app-compare input[formcontrolname="ulbName"]').clear({ force: true }).type(term, { force: true });
  cy.wait(`@search_${term}`);
  cy.contains('mat-option', name).click();
}

/** Assert grouped city header, year header and every value cell of a compare response. */
function assertTable(block: any, idToName: Record<string, string>, ulbIds: string[]) {
  cy.get('app-compare table.mat-mdc-table tr.mat-mdc-header-row').eq(0).find('th').then(($th) => {
    expect([...$th].map((t) => norm(t.textContent || ''))).to.deep.eq(['', ...ulbIds.map((id) => idToName[id])]);
  });
  cy.get('app-compare table.mat-mdc-table tr.mat-mdc-header-row').eq(1).find('th').then(($th) => {
    expect([...$th].map((t) => norm(t.textContent || ''))).to.deep.eq(block.headers.map((h: any) => h.label));
  });
  cy.get('app-compare table.mat-mdc-table tr.mat-mdc-row').should('have.length', block.data.length).each(($tr, r) => {
    const tds = $tr.find('td');
    block.headers.forEach((h: any, c: number) => {
      expect(norm(tds.eq(c).text()), `${block.data[r].indicator} / ${h.key}`).to.eq(norm(cellText(block.data[r][h.key])));
    });
  });
}

describe('Public | City compare — static UI and validation', () => {
  beforeEach(() => {
    interceptAll();
    // Visiting without ?cities makes the page call getUlbDetailsById with an empty
    // slug and getCompareByIndicators with no ulbs/years/keyType, which 400s and
    // surfaces as an uncaught HttpErrorResponse (app bug, see report). Ignore only that.
    cy.on('uncaught:exception', ignoreCompare400);
    cy.visit(PAGE);
    cy.wait('@indicatorList');
  });

  it('shows the heading, mode toggle, the three build steps and the sample comparisons', () => {
    cy.contains('h1', 'Customize and compare city finance data').should('be.visible');
    cy.contains('p', "Reduce your research time and compare financial data of India's top cities in minutes").should('be.visible');
    cy.get('mat-button-toggle').filter((_, t) => norm(t.textContent || '') === 'Compare with Cities').should('have.class', 'mat-button-toggle-checked');
    cy.contains('mat-button-toggle', 'Compare with Cities Averages').should('not.have.class', 'mat-button-toggle-checked');
    cy.contains('h2', 'Build your comparison with Different Cities').should('be.visible');
    cy.contains('p', '01 Select up to three cities').should('be.visible');
    cy.contains('p', '02 Choose Years').should('be.visible');
    cy.contains('p', '03 Select Indicators').should('be.visible');
    cy.contains('h5', 'Not sure where to begin').should('be.visible');
    SAMPLES.forEach((s) => cy.get(`button#${s.id}`).should('be.visible').and(($b) => {
      s.text.forEach((t) => expect(norm($b.text())).to.contain(t));
    }));
    // nothing compared yet → no chart/table section
    cy.contains('Use the dropdown to view charts').should('not.exist');
    cy.get('#downloadAsExcel').should('not.exist');
  });

  it('year chips are the static FY list; "All Years" toggles them all; single chips toggle', () => {
    chip('All years').should('contain.text', 'All Years').and('have.class', 'unselected-secondary-btn');
    YEARS.forEach((y) => chip(y).should('have.class', 'unselected-secondary-btn').find('i').should('have.class', 'bi-plus'));
    chip('All years').click();
    YEARS.forEach((y) => chip(y).should('have.class', 'bg-cfSecondary').find('i').should('have.class', 'bi-x'));
    chip('All years').should('have.class', 'bg-cfSecondary').find('i').should('have.class', 'bi-check2');
    chip(YEARS[0]).click();
    chip(YEARS[0]).should('have.class', 'unselected-secondary-btn');
    chip('All years').should('have.class', 'unselected-secondary-btn');
    chip('All years').click();
    chip(YEARS[0]).should('have.class', 'bg-cfSecondary');
    chip('All years').click();
    YEARS.forEach((y) => chip(y).should('have.class', 'unselected-secondary-btn'));
  });

  it('indicator chips come from the API and behave as single-select', () => {
    cy.get('@indicatorList').its('response.body.data').then((ind: any[]) => {
      ind.forEach((i) => chip(i.label).should('be.visible').and('have.class', 'unselected-secondary-btn'));
      chip(ind[0].label).click();
      chip(ind[0].label).should('have.class', 'bg-cfSecondary');
      chip(ind[1].label).click();
      chip(ind[1].label).should('have.class', 'bg-cfSecondary');
      chip(ind[0].label).should('have.class', 'unselected-secondary-btn');
      chip(ind[1].label).click();
      chip(ind[1].label).should('have.class', 'unselected-secondary-btn');
    });
  });

  it('Apply with nothing selected shows the "all filter options" error (negative)', () => {
    cy.get('#apply').click();
    snackbar('Kindly ensure all filter options are selected before applying the filter.');
    cy.location('search').should('eq', '');
  });

  it('city search: no-results message (negative); add, duplicate, max-3 and remove chips', () => {
    cy.get('app-compare input[formcontrolname="ulbName"]').type('zzqqxx-none', { force: true });
    cy.wait('@search_zzqqxx-none').then(({ request, response }) => {
      expect(request.url).to.contain('type=ulb');
      expect(request.body).to.deep.eq({ matchingWord: 'zzqqxx-none' });
      expect(response!.body.data).to.have.length(0);
    });
    cy.contains('mat-option', 'No results found.').should('have.attr', 'aria-disabled', 'true');
    addCity('Surat', 'Surat Municipal Corporation');
    cy.get('app-compare small.rounded-5[title="Surat Municipal Corporation"]').should('contain.text', 'Surat Municipal...');
    cy.get('app-compare input[formcontrolname="ulbName"]').should('have.value', '');
    addCity('Surat Mun', 'Surat Municipal Corporation');
    snackbar('Surat Municipal Corporation is already selected.');
    addCity('Indore', 'Indore Municipal Corporation');
    addCity('Pune', 'Pune Municipal Corporation');
    addCity('Nagpur', 'Nagpur Municipal Corporation');
    snackbar('Maximum 3 cities can be selected.');
    cy.get('app-compare small.bg-cfSecondary.text-white i.bi-x').should('have.length', 3);
    cy.get('app-compare small[title="Indore Municipal Corporation"] i.bi-x').click();
    cy.get('app-compare small[title="Indore Municipal Corporation"]').should('not.exist');
    cy.get('app-compare small[title="Surat Municipal Corporation"]').should('exist');
  });

  it('Apply with only one city shows the "atleast 2 ulbs" error (negative)', () => {
    cy.get('@indicatorList').its('response.body.data').then((ind: any[]) => {
      addCity('Surat', 'Surat Municipal Corporation');
      chip(YEARS[0]).click();
      chip(ind[0].label).click();
      cy.get('#apply').click();
      snackbar('Kindly ensure atleast 2 ulbs/cities are selected before applying the filter.');
    });
  });

  it('Apply with 2 cities, chosen years and an indicator writes the query string and renders table + chart', () => {
    cy.get('@indicatorList').its('response.body.data').then((ind: any[]) => {
      const indicator = ind.find((i) => i.key === 'debt') || ind[0];
      addCity('Surat', 'Surat Municipal Corporation');
      addCity('Indore', 'Indore Municipal Corporation');
      chip(YEARS[1]).click();
      chip(YEARS[2]).click();
      chip(indicator.label).click();
      cy.get('#apply').click();
      cy.location('search').should('eq', `?cities=surat&cities=indore&years=${YEARS[1]}&years=${YEARS[2]}&indicator=${indicator.key}`);
      cy.wait('@compareKeyed').then(({ request, response }) => {
        const u = decodeURIComponent(request.url);
        expect(u).to.contain(`years=${YEARS[1]}`).and.contain(`years=${YEARS[2]}`).and.contain(`keyType=${indicator.key}`);
        expect(u).not.to.contain(`years=${YEARS[0]}`);
        const block = response!.body[0];
        expect(block.keyType).to.eq(indicator.key);
        const ids = (new URL(request.url)).searchParams.getAll('ulbIds');
        cy.get('@ulbDetails.all').then((calls: any) => {
          const idToName: Record<string, string> = {};
          calls.forEach((c: any) => {
            const ulb = c.response?.body?.ulb ?? c.response?.body?.ulbDetails?.[0];
            if (ulb) idToName[ulb._id] = ulb.name;
          });
          assertTable(block, idToName, ids);
        });
        cy.contains('small', 'All the values are in Crores*').should('be.visible');
        cy.get('#chartContainer app-charts canvas').should('exist');
        const children = indicator.children?.length ? indicator.children : [indicator];
        cy.get('app-compare mat-select').should('contain.text', children[0].label);
      });
    });
  });

  it('Compare with Cities Averages: validation, POST query, chart, PNG button and Reset', () => {
    cy.intercept('POST', '**/api/v1/ledger/getaverageCompareByIndicators*').as('avg');
    cy.contains('mat-button-toggle', 'Compare with Cities Averages').click();
    cy.contains('h2', 'Build your comparison with City Averages').should('be.visible');
    cy.contains('button', 'Apply').click();
    snackbar('Please select all filters');
    cy.get('app-compare input[formcontrolname="ulbName"]').type('Pune', { force: true });
    cy.wait('@search_Pune').its('response.body.data').then((ulbs: any[]) => {
      const pune = ulbs.find((u) => u.name === 'Pune Municipal Corporation');
      cy.contains('mat-option', pune.name).click();
      cy.get('app-compare input[formcontrolname="ulbName"]').should('have.value', pune.name);
      cy.get('app-compare mat-select[formcontrolname="year"]').click({ force: true });
      cy.get('.mat-mdc-select-panel mat-option').should(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.eq(['2021-22', '2020-21', '2019-20']));
      cy.contains('mat-option', '2021-22').click();
      cy.get('app-compare mat-select[formcontrolname="indicator"]').click({ force: true });
      cy.get('.mat-mdc-select-panel mat-option').should(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.eq(['Total revenue', 'Total expenditure', 'Total debt']));
      cy.contains('mat-option', 'Total revenue').click();
      cy.get('app-compare mat-select[formcontrolname="compareBy"]').click({ force: true });
      cy.get('.mat-mdc-select-panel mat-option').should(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.eq(
        ['State Average', 'National Average', 'Population Category Average', 'Municipal Corporation Average']));
      cy.contains('mat-option', 'State Average').click();
      cy.contains('button', 'Apply').click();
      cy.wait('@avg').then(({ request, response }) => {
        expect(request.url).to.contain(`compareType=state&ulbId=${pune._id}&lineItem=totRevenue`);
        expect(request.body).to.deep.eq({ years: ['2019-20', '2020-21', '2021-22'], compareType: 'state', ulbId: pune._id, lineItem: 'totRevenue' });
        expect(response!.body.success).to.eq(true);
        expect(response!.body.data.labels).to.deep.eq(['2019-20', '2020-21', '2021-22']);
      });
      cy.get('#chartContainer app-charts canvas').should('exist');
      cy.contains('button', 'Download as PNG').should('be.visible');
      // PNG export
      cy.window().then((win) => cy.stub(win.HTMLAnchorElement.prototype, 'click').as('anchorClick'));
      cy.contains('button', 'Download as PNG').click();
      cy.get('@anchorClick', { timeout: 20000 }).should('have.been.calledOnce').then((s: any) => {
        expect(s.getCall(0).thisValue.download).to.eq('datasets.png');
        expect(s.getCall(0).thisValue.href).to.match(/^data:image\/png;base64,/);
      });
      cy.contains('button', 'Reset').click();
      cy.get('#chartContainer').should('not.exist');
      cy.get('app-compare input[formcontrolname="ulbName"]').should('have.value', '');
    });
    // Switching back resets the cities mode.
    cy.contains('mat-button-toggle', 'Compare with Cities').first().click();
    cy.contains('h2', 'Build your comparison with Different Cities').should('be.visible');
  });

  it('mobile viewport: steps and Apply/Reset remain reachable', () => {
    cy.viewport('iphone-x');
    cy.contains('h1', 'Customize and compare city finance data').should('be.visible');
    cy.get('#apply').scrollIntoView().should('be.visible');
    cy.get('#reset').should('be.visible');
    // The compare component itself must not overflow the phone viewport; the document-level overflow is logged
    // (staging shows ~10px of page-level horizontal overflow at 375px — cosmetic, not asserted).
    cy.window().then((win) => {
      const doc = win.document.documentElement;
      if (doc.scrollWidth > win.innerWidth + 1) cy.log(`Page-level horizontal overflow: ${doc.scrollWidth}px > ${win.innerWidth}px`);
    });
    cy.get('app-compare').then(($c) => expect($c[0].getBoundingClientRect().right).to.be.at.most(376));
  });
});

describe('Public | City compare — deep links and results', () => {
  it('?cities=<slug> (from the city dashboard) preselects that city; the incomplete compare call 400s (known bug)', () => {
    interceptAll();
    cy.on('uncaught:exception', ignoreCompare400);
    cy.visit(`${PAGE}?cities=pune`);
    cy.wait('@ulbDetails').its('request.url').should('contain', 'slug=pune');
    cy.wait('@compare').then(({ request, response }) => {
      expect(request.url).not.to.contain('keyType');
      expect(response!.statusCode).to.eq(400);
    });
    cy.get('app-compare small[title="Pune Municipal Corporation"]').should('be.visible');
    cy.contains('h5', 'Not sure where to begin').should('be.visible');
  });

  SAMPLES.forEach((s) => {
    it(`sample "${s.text.join(' ')}" navigates with its query params and renders the comparison`, () => {
      interceptAll();
      cy.on('uncaught:exception', ignoreCompare400);
      cy.visit(PAGE);
      cy.wait('@indicatorList').its('response.body.data').then((ind: any[]) => {
        const indicator = ind.find((i) => i.key === s.indicator);
        cy.get(`button#${s.id}`).click();
        cy.location('search').should('eq', `?${s.cities.map((c) => `cities=${c}`).join('&')}&${YEARS.map((y) => `years=${y}`).join('&')}&indicator=${s.indicator}`);
        cy.wait('@compareKeyed').then(({ request, response }: any) => {
          expect(decodeURIComponent(request.url)).to.contain(`keyType=${s.indicator}`);
          const ids = (new URL(request.url)).searchParams.getAll('ulbIds');
          expect(ids).to.have.length(3);
          cy.get('@ulbDetails.all').then((calls: any) => {
            const idToName: Record<string, string> = {};
            calls.forEach((c: any) => {
              const ulb = c.response?.body?.ulb ?? c.response?.body?.ulbDetails?.[0];
              if (ulb) idToName[ulb._id] = ulb.name;
            });
            assertTable(response.body[0], idToName, ids);
          });
          // All three years and the indicator chip are active.
          YEARS.forEach((y) => chip(y).should('have.class', 'bg-cfSecondary'));
          chip(indicator.label).should('have.class', 'bg-cfSecondary');
          cy.contains('h5', 'Not sure where to begin').should('not.exist');
          const children = indicator.children?.length ? indicator.children : [indicator];
          cy.get('app-compare mat-select').click();
          cy.get('.mat-mdc-select-panel mat-option').should(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.eq(children.map((c: any) => c.label)));
          // The overlay panel opens near the viewport edge; force-click the option itself.
          if (children.length > 1) cy.contains('mat-option', children[1].label).click({ force: true });
          else cy.get('body').type('{esc}');
          cy.get('#chartContainer app-charts canvas').should('exist');
          cy.contains('small', s.indicator === 'keyNumbers' ? 'Some values are crores*' : 'All the values are in Crores*').should('be.visible');
        });
      });
    });
  });

  it('direct deep link with cities/years/indicator loads the comparison; PNG and XLSX export; Reset clears it', () => {
    interceptAll();
    cy.intercept('GET', '**/assets/images/excel-cf-logo.png').as('logo');
    const s = SAMPLES[0];
    cy.visit(`${PAGE}?cities=${s.cities.join('&cities=')}&years=${YEARS.join('&years=')}&indicator=${s.indicator}`);
    cy.wait('@compare').then(({ request, response }) => {
      expect(decodeURIComponent(request.url)).to.contain(`keyType=${s.indicator}`);
      expect(response!.statusCode).to.eq(200);
    });
    cy.get('app-compare table.mat-mdc-table tr.mat-mdc-row').should('have.length.greaterThan', 0);
    cy.contains('p', 'Use the dropdown to view charts for individual indicators within the selected group.').should('be.visible');
    // PNG
    cy.window().then((win) => {
      cy.stub(win.HTMLAnchorElement.prototype, 'click').as('anchorClick');
      cy.spy(win.URL, 'createObjectURL').as('blobUrl');
    });
    cy.get('#downloadAsPng').click();
    cy.get('@anchorClick', { timeout: 20000 }).should('have.been.called').then((st: any) => {
      expect(st.getCall(0).thisValue.download).to.eq('datasets.png');
    });
    // XLSX (exceljs + file-saver)
    cy.get('#downloadAsExcel').should('contain.text', 'Download as XLSX').click();
    cy.wait('@logo');
    cy.get('@blobUrl').should('have.been.called').then((spy: any) => {
      const blob = spy.getCalls().map((c: any) => c.args[0]).find((b: any) => b && typeof b.type === 'string' && typeof b.size === 'number');
      expect(blob.type).to.eq('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(blob.size).to.be.greaterThan(1000);
    });
    snackbar('File downloaded successfully!');
    // Reset
    cy.get('#reset').click();
    cy.get('app-compare small.bg-cfSecondary.text-white[title$="Corporation"], app-compare small.bg-cfSecondary.text-white[title$="Palike"]').should('not.exist');
    YEARS.forEach((y) => chip(y).should('have.class', 'unselected-secondary-btn'));
    cy.get('app-compare table.mat-mdc-table').should('not.exist');
    cy.contains('h5', 'Not sure where to begin').should('be.visible');
  });
});
