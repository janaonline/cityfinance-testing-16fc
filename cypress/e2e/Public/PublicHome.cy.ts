/**
 * Public (logged-out) Home page.
 * URL: /home  (also reached from "/" via redirect)
 *
 * Built from the cf-ui-ssr-v3 `staging` branch (src/app/pages/home/*,
 * shared/components/{map,state-search,city-search,grid-view},
 * shared/services/national-dashboard.ts) and checked against staging.
 *
 * Sections covered: hero (logo, ULB ticker, global city/state search),
 * "In the Spotlight" carousel, "Explore" dashboard map section (India map,
 * state / city drill-down via dropdowns and via the map, stats grid,
 * dashboard navigation), "Discover" cards and the partners strip.
 *
 * Note on data: the page is server-side rendered and Angular's HTTP transfer
 * cache replays the initial GET calls on hydration, so the first-load data
 * never hits the network from the browser. Expected values for that data are
 * therefore fetched with cy.request() from the same API the app uses; data
 * loaded by user interaction is asserted against intercepted responses.
 */
export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const API = '/api/v1';

interface GridItem { sequence: number; label: string; value: string | number; info?: string }
interface StateRow { _id: string; name: string; code: string; slug: string; isPublish?: boolean }
interface UlbRow { _id: string; name: string; slug: string; location?: { lat: string; lng: string } }

const SEARCH_RE = /\/api\/v1\/recentSearchKeyword\/search\?type=(&|$)/;

/** Retrying assertion on the text of every enabled option in the open autocomplete panel. */
const expectOptions = (check: (texts: string[]) => void) =>
  cy.get('.mat-mdc-autocomplete-panel mat-option:not(.mdc-list-item--disabled)')
    .should(($o) => check(Cypress._.map($o, (el) => (el.textContent || '').replace(/\s+/g, ' ').trim())));

/** Asserts the stats grid shows exactly the given items, in order. */
const expectGrid = (items: GridItem[]) => {
  cy.get('app-dashboard-map-section .explore-data-grid > div')
    .should(($cells) => {
      expect($cells, 'grid cells').to.have.length(items.length);
      $cells.each((i, cell) => {
        const ps = Cypress.$(cell).find('p');
        expect(ps.eq(0).text().trim(), `grid value #${i}`).to.eq(String(items[i].value));
        expect(ps.eq(1).text().trim(), `grid label #${i}`).to.eq(items[i].label);
        expect(Cypress.$(cell).find('i.bi-info-circle').length > 0, `info icon #${i}`).to.eq(!!items[i].info);
      });
    });
};

const mediumDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const visitHome = () => {
  cy.visit('/home');
  // Hydration done once the browser-only Leaflet map has drawn the states.
  cy.get('#map-container path.leaflet-interactive', { timeout: 30000 }).should('have.length.greaterThan', 10);
};

/**
 * Yields the map <path> for a state, identified the way a user would: by
 * hovering it and reading the Leaflet tooltip (state shapes carry no other
 * identifying attribute).
 */
const mapPath = (stateName: string) =>
  cy.get('#map-container path.leaflet-interactive').then(($paths) => {
    const match = $paths.toArray().find((p) => {
      const r = p.getBoundingClientRect();
      const opts = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      p.dispatchEvent(new MouseEvent('mouseover', opts));
      const tip = Cypress.$('#map-container .leaflet-tooltip').last().text().trim();
      p.dispatchEvent(new MouseEvent('mouseout', opts));
      return tip === stateName;
    });
    expect(match, `map shape for ${stateName}`).to.exist;
    return Cypress.$(match!);
  });

/**
 * Material's floating <mat-label> sits over the empty input, so focus the
 * form field first (as a user would) and then type.
 */
const typeState = (text: string) => {
  cy.get('app-state-search mat-form-field').click();
  cy.get('app-state-search input#stateName').type(text);
};
const typeCity = (text: string) => {
  cy.get('app-city-search mat-form-field').click();
  cy.get('app-city-search input').type(text);
};

/**
 * App bug (map.ts loadMapData): `res['data'][stateCode]['ulbs']` is read without
 * a guard, so a state the /ulbs API has no entry for (e.g. Lakshadweep), or a
 * stale response racing a newer selection, throws
 * "Cannot read properties of undefined (reading 'ulbs')"; an intermittent sibling,
 * "... (reading 'lat')", was also seen on staging during map drill-down. Only these errors
 * are tolerated, and they are recorded so tests can assert on them.
 */
let ulbsErrors: string[] = [];
const tolerateMapUlbsBug = () => {
  ulbsErrors = [];
  cy.on('uncaught:exception', (err) => {
    if (/reading '(ulbs|lat)'/.test(err.message)) {
      ulbsErrors.push(err.message);
      return false;
    }
    return undefined;
  });
};

describe('Public | Home page', () => {
  let nationalData: { gridDetails: GridItem[]; lastModifiedAt: string };
  let states: StateRow[];
  let geoStateCodes: string[];

  before(() => {
    cy.request(`${API}/dashboard/home-page/get-Data`).then(({ body }) => {
      nationalData = body;
    });
    cy.request(`${API}/state`).then(({ body }) => {
      states = body.data;
    });
    cy.request('/assets/jsonFile/state_boundaries_24Jan2024.json').then(({ body }) => {
      geoStateCodes = body.features.map((f: any) => f.properties.ST_CODE);
    });
  });

  describe('page shell and hero', () => {
    beforeEach(visitHome);

    it('redirects "/" to /home and sets the SEO title and description', () => {
      cy.visit('/');
      cy.location('pathname').should('eq', '/home');
      cy.title().should('eq', 'City Finance - Financial Data of 4,000+ Indian Cities');
      cy.get('meta[name="description"]')
        .should('have.attr', 'content')
        .and('contain', 'Explore standardized, credible financial data of over 4,000 Indian urban local bodies');
      cy.get('meta[property="og:url"]').should('have.attr', 'content').and('match', /\/home$/);
    });

    it('shows the cityfinance.in logo and a ULB ticker that counts up to the API figure', () => {
      cy.get('app-search-bar h1').should('contain.text', 'city').and('contain.text', 'finance.in');
      cy.get('app-search-bar').should('contain.text', 'Standardised, timely and credible financial information for')
        .and('contain.text', 'cities of India');
      // The ticker ends on the first grid figure ("ULBs with at least 1 Year of Financial Data").
      const expected = Number(String(nationalData.gridDetails[0].value).replace(/,/g, ''));
      cy.get('.countup-span', { timeout: 10000 })
        .should(($s) => expect(Number($s.text().replace(/,/g, ''))).to.eq(expected));
    });

    it('does not show logged-in widgets (report-issue button) on the home page', () => {
      cy.get('button.report-issue').should('not.exist');
    });
  });

  describe('global city / state search', () => {
    beforeEach(() => {
      cy.intercept('POST', SEARCH_RE).as('search');
      visitHome();
    });

    it('suggests cities from the search API and navigates to the chosen city dashboard', () => {
      cy.get('app-search-bar input[placeholder="Search for City or State"]').type('pune');
      cy.wait('@search').then(({ request, response }) => {
        expect(request.body).to.deep.eq({ matchingWord: 'pune' });
        const data = response!.body.data as any[];
        expect(data, 'search results for "pune"').to.not.be.empty;
        const expected = data.map((o) =>
          `${o.name} | ${o.type === 'ulb' ? o.ulbType.name : Cypress._.startCase(o.type)}`);
        expectOptions((t) => expect(t).to.deep.eq(expected));

        const ulb = data.find((o) => o.type === 'ulb');
        expect(ulb, 'a ULB result').to.exist;
        cy.contains('.mat-mdc-autocomplete-panel mat-option', ulb.name).click();
        cy.location('pathname').should('eq', `/municipal-data/city/${ulb.slug}`);
      });
    });

    it('suggests states and navigates to the chosen state dashboard', () => {
      const state = states.find((s) => s.code === 'KL') || states[0];
      cy.get('app-search-bar input').type(state.name);
      cy.wait('@search').then(({ response }) => {
        const hit = (response!.body.data as any[]).find((o) => o.type === 'state' && o.name === state.name);
        expect(hit, `state suggestion for ${state.name}`).to.exist;
        cy.contains('.mat-mdc-autocomplete-panel mat-option', state.name).should('contain.text', '| State').click();
        cy.location('pathname').should('eq', `/municipal-data/state/${hit.slug}`);
      });
    });

    it('KNOWN BUG: the Search button with an exact match does not navigate (slug not passed)', () => {
      // search-bar.ts globalSearchClick() builds { type, _id } without `slug`, so
      // dashboardNav() calls router.navigate(['/municipal-data/state', undefined]),
      // which Angular rejects. Expected (once fixed): /municipal-data/state/<slug>.
      const state = states.find((s) => s.code === 'KL') || states[0];
      cy.window().then((w) => cy.spy(w.console, 'error').as('consoleError'));
      cy.get('app-search-bar input').type(state.name);
      cy.wait('@search');
      cy.contains('.mat-mdc-autocomplete-panel mat-option', state.name).should('be.visible');
      cy.get('app-search-bar h1').click(); // close the panel without selecting
      cy.get('.mat-mdc-autocomplete-panel').should('not.exist');
      cy.contains('app-search-bar button', 'Search').click();
      // Angular logs NG04008 "The requested path contains undefined segment at index 1".
      cy.get('@consoleError').should((spy: any) => {
        const logged = (spy.args as any[][]).flat().map((a) => String(a?.message ?? a)).join('\n');
        expect(logged).to.match(/NG04008|undefined segment/i);
      });
      cy.location('pathname').should('eq', '/home');
    });

    it('does not query the API for a single character (minimum 2)', () => {
      cy.get('app-search-bar input').type('p');
      // Let the 300 ms debounce elapse (short retrying check, not a fixed wait).
      cy.then(() => {
        const t0 = Date.now();
        cy.wrap(null).should(() => expect(Date.now() - t0).to.be.greaterThan(1000));
      });
      cy.get('@search.all').should('have.length', 0);
      cy.get('.mat-mdc-autocomplete-panel mat-option').should('not.exist');
      cy.get('app-search-bar input').type('u');
      cy.wait('@search').its('request.body').should('deep.eq', { matchingWord: 'pu' });
      cy.get('@search.all').should('have.length', 1);
    });

    it('shows a "nothing found" hint for unknown text and the Search button stays on /home', () => {
      cy.get('app-search-bar input').type('zzqxj-no-such-city');
      cy.wait('@search').its('response.body.data').should('have.length', 0);
      cy.get('.mat-mdc-autocomplete-panel mat-option')
        .should('have.length', 1)
        .and('have.class', 'mdc-list-item--disabled')
        .and('contain.text', 'Sorry, we can’t find anything related to your search');
      cy.contains('app-search-bar button', 'Search').click({ force: true });
      cy.location('pathname').should('eq', '/home');
    });
  });

  describe('"In the Spotlight" carousel', () => {
    // Static list from spotlight.ts.
    const SPOTLIGHT = [
      'XVI FC Operational Guidelines', 'Credit Rating Toolkit', 'Property Tax Toolkit',
      'A Municipal Finance Blueprint For India', 'RBI Report on Municipal Finances',
      'XVI FC Constitution & Terms of Reference', 'City Finance Rankings Framework', 'ASICS Report 2023',
      'Indian Urban Infrastructure & Services', 'National Municipal Accounts Manual',
      'XV FC Main Report Volume I', 'XV FC Operational Guidelines', 'Report of the XVI-FC Volume 1',
      'A Blueprint for Urban Fiscal Devolution',
    ];
    const realSlides = 'app-spotlight .slick-slide:not(.slick-cloned)';

    beforeEach(visitHome);

    it('lists every spotlight document, flags the newest and opens PDFs in a new tab', () => {
      cy.contains('app-spotlight h3', 'In the Spotlight').should('be.visible');
      cy.get(realSlides).should('have.length', SPOTLIGHT.length).each(($s, i) => {
        const a = $s.find('a.card-label');
        expect(a.text().trim()).to.eq(SPOTLIGHT[i]);
        expect(a.attr('target')).to.eq('_blank');
        expect(a.attr('href')).to.match(/^\/assets\/.+\.pdf$/);
      });
      cy.get(realSlides).first().find('.new-badge').should('have.text', 'New!');
      cy.get(realSlides).filter(':has(.new-badge)').should('have.length', 1);
    });

    it('serves every spotlight PDF and thumbnail', () => {
      cy.get(realSlides).each(($s) => {
        const href = $s.find('a.card-label').attr('href')!;
        const img = $s.find('.card-image img').attr('src')!;
        cy.request({ method: 'HEAD', url: href }).then((r) => {
          expect(r.status, href).to.eq(200);
          expect(r.headers['content-type'], href).to.contain('pdf');
        });
        cy.request({ method: 'HEAD', url: img }).its('status').should('eq', 200);
      });
    });

    it('pages through the carousel with the dots (3 per page)', () => {
      cy.get('app-spotlight .slick-dots li').should('have.length', Math.ceil(SPOTLIGHT.length / 3));
      cy.get('app-spotlight .slick-dots li').eq(2).find('button').click();
      cy.get('app-spotlight .slick-dots li').eq(2).should('have.class', 'slick-active');
      // Page 3 starts at item index 6.
      cy.get('app-spotlight .slick-slide.slick-current a.card-label')
        .should(($a) => expect($a.text().trim()).to.eq(SPOTLIGHT[6]));
    });
  });

  describe('"Explore" dashboard map section', () => {
    beforeEach(() => {
      tolerateMapUlbsBug();
      visitHome();
    });

    it('shows the state name in a tooltip when hovering a state on the map', () => {
      // Every shape's tooltip names a state from the geojson.
      cy.get('#map-container path.leaflet-interactive').then(($paths) => {
        const names = $paths.toArray().map((p) => {
          const r = p.getBoundingClientRect();
          const opts = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
          p.dispatchEvent(new MouseEvent('mouseover', opts));
          const tip = Cypress.$('#map-container .leaflet-tooltip').last().text().trim();
          p.dispatchEvent(new MouseEvent('mouseout', opts));
          return tip;
        });
        expect(names.filter(Boolean), 'one tooltip per shape').to.have.length($paths.length);
        states.filter((s) => s.name !== 'Jammu and Kashmir')
          .forEach((s) => expect(names, `tooltip for ${s.name}`).to.include(s.name));
      });
      // Hover highlights the shape; leaving restores its colour.
      mapPath('Kerala').then(($p) => {
        const before = $p.attr('fill');
        const r = $p[0].getBoundingClientRect();
        const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, force: true };
        cy.wrap($p).trigger('mouseover', at).should('not.have.attr', 'fill', before);
        cy.get('#map-container .leaflet-tooltip').last().should('have.text', 'Kerala');
        cy.wrap($p).trigger('mouseout', at).should('have.attr', 'fill', before);
      });
    });

    it('KNOWN BUG: clicking a state with no ULB map data (Lakshadweep) throws, but the stats still load', () => {
      const lk = states.find((s) => s.name === 'Lakshadweep');
      if (!lk) {
        cy.log('Lakshadweep is not in the state list on staging — skipping');
        return;
      }
      cy.intercept('GET', new RegExp(`/get-Data\\?stateCode=${lk.code}&`)).as('stateData');
      cy.intercept('GET', new RegExp(`/api/v1/+ulbs\\?stateCode=${lk.code}$`)).as('mapUlbs');
      mapPath('Lakshadweep').trigger('click', { force: true });
      cy.wait('@stateData').then(({ response }) => expectGrid(Cypress._.sortBy(response!.body.gridDetails, 'sequence')));
      cy.get('app-dashboard-map-section .fw-bold.fs-5.my-3').should('contain.text', 'Lakshadweep');
      cy.wait('@mapUlbs').its('response.body.data').then((data) => {
        if (data[lk.code]) return; // data was added — the bug no longer triggers
        cy.wrap(null).should(() => expect(ulbsErrors, 'map threw on missing ULB data').to.have.length.greaterThan(0));
        cy.get('#map-container .leaflet-marker-icon').should('not.exist');
      });
    });

    it('shows the national stats grid and last-updated date from the API', () => {
      cy.get('#main-content').should('have.text', 'Explore');
      cy.contains('Click on the map or use the drop down to drill down to a state or city.').should('be.visible');
      cy.get('app-dashboard-map-section .fw-bold.fs-5.my-3').invoke('text').invoke('trim').should('eq', 'India');
      const sorted = Cypress._.sortBy(nationalData.gridDetails, 'sequence');
      expectGrid(sorted);
      cy.contains('app-dashboard-map-section p', 'Last updated on:')
        .should('contain.text', mediumDate(nationalData.lastModifiedAt));
      // Nothing selected yet: no reset / dashboard buttons, no ULB search.
      cy.contains('button', 'Reset Map To India').should('not.exist');
      cy.contains('button', /View (State|City) Dashboard/).should('not.exist');
      cy.get('app-city-search').should('not.exist');
    });

    it('shows the info tooltip for grid items that carry a breakdown', () => {
      const withInfo = nationalData.gridDetails.find((g) => g.info);
      if (!withInfo) {
        cy.log('No grid item has info text on staging — nothing to check');
        return;
      }
      cy.contains('app-dashboard-map-section .explore-data-grid > div', withInfo.label)
        .find('i.bi-info-circle').trigger('mouseenter');
      cy.get('.mat-mdc-tooltip').should('be.visible')
        .and('contain.text', withInfo.info!.split('\n')[0]);
    });

    it('draws one map shape per state boundary feature', () => {
      cy.get('#map-container path.leaflet-interactive').should('have.length', geoStateCodes.length);
    });

    it('filters the state dropdown and drills down to a state, then a city, then its dashboard', () => {
      const state = states.find((s) => s.code === 'KL') || states[0];
      const term = state.name.slice(0, 4);
      const expectedStates = states.filter((s) => s.name.toLowerCase().includes(term.toLowerCase())).map((s) => s.name);

      cy.intercept('GET', new RegExp(`/dashboard/home-page/get-Data\\?stateCode=${state.code}&stateId=${state._id}`)).as('stateData');
      cy.intercept('GET', new RegExp(`/api/v1/+ulbs\\?stateCode=${state.code}$`)).as('mapUlbs');

      typeState(term);
      expectOptions((t) => expect(t).to.deep.eq(expectedStates));
      cy.contains('.mat-mdc-autocomplete-panel mat-option', new RegExp(`^\\s*${state.name}\\s*$`)).click();

      cy.wait('@stateData').then(({ response }) => {
        expectGrid(Cypress._.sortBy(response!.body.gridDetails, 'sequence'));
        cy.contains('app-dashboard-map-section p', 'Last updated on:')
          .should('contain.text', mediumDate(response!.body.lastModifiedAt));
      });
      cy.get('app-dashboard-map-section .fw-bold.fs-5.my-3').should('contain.text', state.name);
      cy.contains('button', 'Reset Map To India').should('be.visible');
      cy.contains('button', 'View State Dashboard').should('be.visible');

      // The map zooms to the chosen state and drops a marker per located ULB.
      cy.wait('@mapUlbs').then(({ response }) => {
        const ulbs: UlbRow[] = response!.body.data[state.code].ulbs;
        const located = ulbs.filter((u) => u.location?.lat && u.location?.lng);
        cy.get('#map-container path.leaflet-interactive').should('have.length', 1);
        cy.get('#map-container .leaflet-marker-icon').should('have.length', located.length);

        // ULB search is scoped to the selected state.
        const ulb = located[0];
        const ulbTerm = ulb.name.slice(0, 6);
        cy.intercept('POST', new RegExp(`/recentSearchKeyword/search\\?type=ulb&state=${state._id}$`)).as('ulbSearch');
        cy.intercept('GET', `**/dashboard/city/city-details?citySlugName=${ulb.slug}`).as('cityDetails');
        typeCity(ulbTerm);
        cy.wait('@ulbSearch').then(({ request, response: res }) => {
          expect(request.body).to.deep.eq({ matchingWord: ulbTerm });
          expectOptions((t) => expect(t).to.deep.eq((res!.body.data as any[]).map((o) => o.name)));
        });
        cy.contains('.mat-mdc-autocomplete-panel mat-option', new RegExp(`^\\s*${Cypress._.escapeRegExp(ulb.name)}\\s*$`)).click();
        cy.wait('@cityDetails').then(({ response: res }) => {
          expectGrid(Cypress._.sortBy(res!.body.gridDetails, 'sequence'));
        });
        cy.get('app-dashboard-map-section .fw-bold.fs-5.my-3 span').should('contain.text', ulb.name);
        cy.contains('button', 'View City Dashboard').click();
        cy.location('pathname').should('eq', `/municipal-data/city/${ulb.slug}`);
      });
    });

    it('drills down by clicking a state on the map and resets back to India', () => {
      cy.intercept('GET', /\/dashboard\/home-page\/get-Data\?stateCode=/).as('stateData');
      mapPath('Rajasthan').trigger('click', { force: true });
      cy.wait('@stateData').then(({ request, response }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get('stateCode')!;
        const state = states.find((s) => s.code === code)!;
        expect(state, `state with code ${code}`).to.exist;
        expect(url.searchParams.get('stateId')).to.eq(state._id);
        cy.get('app-dashboard-map-section .fw-bold.fs-5.my-3').should('contain.text', state.name);
        cy.get('app-state-search input#stateName').should('have.value', state.name);
        expectGrid(Cypress._.sortBy(response!.body.gridDetails, 'sequence'));
        cy.get('#map-container path.leaflet-interactive').should('have.length', 1);
        cy.contains('button', 'View State Dashboard').should('be.visible');
      });

      cy.intercept('GET', /\/dashboard\/home-page\/get-Data$/).as('indiaData');
      cy.contains('button', 'Reset Map To India').click();
      cy.wait('@indiaData');
      cy.get('app-dashboard-map-section .fw-bold.fs-5.my-3').invoke('text').invoke('trim').should('eq', 'India');
      cy.get('#map-container path.leaflet-interactive').should('have.length', geoStateCodes.length);
      cy.get('#map-container .leaflet-marker-icon').should('not.exist');
      cy.get('app-state-search input#stateName').should('have.value', '');
      cy.contains('button', 'Reset Map To India').should('not.exist');
    });

    it('opens the state dashboard for a state picked from the dropdown', () => {
      const state = states.find((s) => s.code === 'KL') || states[0];
      typeState(state.name);
      cy.contains('.mat-mdc-autocomplete-panel mat-option', new RegExp(`^\\s*${state.name}\\s*$`)).click();
      cy.contains('button', 'View State Dashboard').click();
      cy.location('pathname').should('eq', `/municipal-data/state/${state.slug}`);
    });

    it('selects a city by clicking its map marker and opens the city dashboard', () => {
      const state = states.find((s) => s.code === 'KL') || states[0];
      cy.intercept('GET', new RegExp(`/api/v1/+ulbs\\?stateCode=${state.code}$`)).as('mapUlbs');
      cy.intercept('GET', '**/dashboard/city/city-details?citySlugName=*').as('cityDetails');
      typeState(state.name);
      cy.contains('.mat-mdc-autocomplete-panel mat-option', new RegExp(`^\\s*${state.name}\\s*$`)).click();
      cy.wait('@mapUlbs');
      cy.get('#map-container .leaflet-marker-icon').first().trigger('click', { force: true });
      cy.wait('@cityDetails').then(({ request, response }) => {
        const slug = new URL(request.url).searchParams.get('citySlugName');
        expect(response!.body.ulbName).to.be.a('string');
        cy.get('app-dashboard-map-section .fw-bold.fs-5.my-3 span').should('contain.text', response!.body.ulbName);
        cy.get('app-city-search input').should('have.value', response!.body.ulbName);
        expectGrid(Cypress._.sortBy(response!.body.gridDetails, 'sequence'));
        cy.contains('button', 'View City Dashboard').click();
        cy.location('pathname').should('eq', `/municipal-data/city/${slug}`);
      });
    });

    it('clears the typed state with the X button and lists all states again', () => {
      cy.get('app-state-search button[aria-label="Clear"]').should('not.exist');
      typeState('Kar');
      expectOptions((t) => expect(t).to.have.length.within(1, states.length - 1));
      cy.get('app-state-search button[aria-label="Clear"]').click();
      cy.get('app-state-search input#stateName').should('have.value', '');
      cy.get('app-state-search button[aria-label="Clear"]').should('not.exist');
      cy.get('app-state-search mat-form-field').click();
      expectOptions((t) => expect(t).to.deep.eq(states.map((s) => s.name)));
    });

    it('shows "No results found." when the ULB search has no match in the selected state', () => {
      const state = states.find((s) => s.code === 'KL') || states[0];
      cy.intercept('POST', new RegExp(`/recentSearchKeyword/search\\?type=ulb&state=${state._id}$`)).as('ulbSearch');
      typeState(state.name);
      cy.contains('.mat-mdc-autocomplete-panel mat-option', new RegExp(`^\\s*${state.name}\\s*$`)).click();
      typeCity('zzqxj');
      cy.wait('@ulbSearch').its('response.body.data').should('have.length', 0);
      cy.get('.mat-mdc-autocomplete-panel mat-option')
        .should('have.length', 1)
        .and('have.class', 'mdc-list-item--disabled')
        .and('contain.text', 'No results found.');
    });

    it('shows "No results found" for an unknown state', () => {
      typeState('zzqx');
      cy.get('.mat-mdc-autocomplete-panel mat-option')
        .should('have.length', 1)
        .and('contain.text', 'No results found for your search.');
    });
  });

  describe('"Discover" section', () => {
    const CARDS = [
      ['Financial Performance Of Cities', '/v1/dashboard/national'],
      ['Improve Own Revenue', '/v1/own-revenue-dashboard'],
      ['Resources', '/v1/resources-dashboard/learning-center/toolkits'],
      ['Service Level Benchmarks', '/v1/dashboard/slb'],
      ['XV Finance Commission Grants', '/v1/login'],
      ['Upload Annual Accounts', '/v1/upload-annual-accounts'],
    ];

    beforeEach(visitHome);

    it('renders each card with icon, description and a "Know More" link to the v1 app', () => {
      cy.contains('app-discover-section h2', 'Discover').should('exist');
      cy.contains('app-discover-section p', 'Delve into key aspects of municipal data').should('exist');
      cy.get('app-discover-section .card').should('have.length', CARDS.length).each(($c, i) => {
        const [label, href] = CARDS[i];
        expect($c.find('p.fw-bold').text().trim()).to.eq(label);
        expect($c.find('p.text-secondary').text().trim()).to.not.be.empty;
        expect($c.find('img').attr('alt')).to.eq(label);
        const a = $c.find('a.hidden-button');
        expect(a.text().trim()).to.eq('Know More');
        expect(a.attr('href')).to.eq(href);
        expect(($c.find('img')[0] as HTMLImageElement).naturalWidth, `${label} icon loaded`).to.be.greaterThan(0);
      });
    });

    it('serves every "Know More" target', () => {
      CARDS.forEach(([, href]) => cy.request(href).its('status').should('eq', 200));
    });

    it('follows a "Know More" link to the v1 app', () => {
      cy.intercept('GET', '**/v1/own-revenue-dashboard').as('v1Doc');
      cy.contains('app-discover-section .card', 'Improve Own Revenue')
        .find('a.hidden-button').click({ force: true }); // button is revealed on hover
      // The browser leaves the SSR app for the v1 document (the v1 SPA sometimes then
      // redirects itself to /v1/, so assert on the document request, not the final URL).
      cy.wait('@v1Doc').its('response.statusCode').should('be.oneOf', [200, 304]);
      cy.location('pathname', { timeout: 30000 }).should('match', /^\/v1\//);
    });
  });

  describe('partners strip', () => {
    beforeEach(visitHome);

    it('links each partner logo to its site in a new tab', () => {
      const PARTNERS: [string, string, string][] = [
        ['Conceived & Managed by', 'Janaagraha', 'https://www.janaagraha.org/home/'],
        ['Knowledge Partner', 'MAGC', 'https://www.magc.in/'],
        ['Supported by', 'Gates Foundation', 'https://www.gatesfoundation.org/'],
        ['Supported by', 'CWAS', 'https://crdf.org.in/center/cwas'],
        ['Supported by', 'World Bank', 'https://www.worldbank.org'],
      ];
      ['Conceived & Managed by', 'Knowledge Partner', 'Supported by']
        .forEach((t) => cy.contains('app-sponsers-partners p', t).should('be.visible'));
      cy.get('app-sponsers-partners a').should('have.length', PARTNERS.length);
      PARTNERS.forEach(([, alt, href]) => {
        cy.get(`app-sponsers-partners img[alt="${alt}"]`)
          .should('be.visible')
          .and(($img) => expect(($img[0] as HTMLImageElement).naturalWidth, `${alt} logo`).to.be.greaterThan(0))
          .closest('a')
          .should('have.attr', 'href', href)
          .and('have.attr', 'target', '_blank')
          .and('have.attr', 'rel', 'noopener');
      });
      cy.get('app-sponsers-partners .jana-text').should('contain.text', 'Centre for Citizenship');
    });
  });
});
