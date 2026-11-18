/**
 * Public (logged-out) City Dashboard — Service Level Benchmark tab.
 * URL: /municipal-data/city/:slug  (staging city: pune)
 *
 * Built from the cf-ui-ssr-v3 `staging` branch (src/app/pages/dashboard/city/**,
 * dashboard-service.ts, shared/components/**) and cf-nest-api-v2 response
 * shapes; checked against staging. Read-only: the only POSTs are the page's
 * ULB search lookups. Expected values come from intercepted API responses
 * (or cy.request where the page hydrates from SSR TransferState and makes no
 * browser call); only static UI text is hard-coded.
 *
 * Covers: theme buttons, gauges/thumbs/legend vs API, compare-by ULB + reset,
 * search with no results, financial-year switch.
 */
import {
  API, SLUG, SAME_STATE_CITY, EMPTY_SLUG, inr, norm, stripHtml, threeYears, snackbar, cityDetails,
  interceptCommon, visitCity, tab, openTab, treeNode, fpCellText, assertTree, chartTitle, chartTitleIs, expectedWarning,
} from './cityDashboardHelpers';

export {}; // Own module scope so top-level names don't collide across specs.

describe('Public | City dashboard — Service Level Benchmark tab', () => {
  const UNIT: Record<string, string> = {
    'litres per capita per day (lpcd)': 'LCPD', Incidents: 'Incidents', Percent: '%', 'Hours per day': 'Hr(s)', 'Nos. per year': 'Incidents',
  };

  function visitSlb(slug = SLUG) {
    cy.intercept('GET', /\/api\/v1\/(indicators|dashboard\/city\/slb-indicators)\?/).as('slb');
    visitCity(slug);
    openTab('Service Level Benchmark');
  }

  function assertCharts(data: any[]) {
    cy.get('app-slb .chart-wrapper').should('have.length', data.length);
    data.forEach((ind, i) => {
      const v = Math.round(ind.value);
      cy.get('app-slb .chart-wrapper').eq(i).within(() => {
        cy.get('.chart-title p').eq(0).should(($p) => expect(norm($p.text())).to.eq(`${v}${UNIT[ind.unitType] ?? ind.unitType}`));
        cy.get('.chart-title p').eq(1).should(($p) => expect(norm($p.text())).to.eq(ind.name));
        cy.get('i.bi-hand-thumbs-up-fill').should('have.class', v > Math.round(ind.nationalValue) ? 'text-success' : 'text-light');
        cy.get('canvas').should('exist');
      });
    });
  }

  it('defaults to Water Supply for the latest SLB year; gauges, thumbs and legend match the API', () => {
    visitSlb();
    cityDetails().then((c: any) => {
      cy.request(`${API}/common/get-latest-slbs-year?ulb=${c.ulbId}&fetchCeptYears=true`).its('body.slbYears').then((years: string[]) => {
        cy.wait('@slb').then(({ request, response }) => {
          const u = decodeURIComponent(request.url);
          expect(u).to.contain('type=Water Supply').and.contain(`ulb=${c.ulbId}`).and.contain(`year=${years[0]}`);
          expect(request.url).to.match(Number(years[0].slice(0, 4)) <= 2020 ? /\/indicators\?/ : /slb-indicators\?/);
          cy.contains('p', 'This dashboard aims to measure performance of 28 service level indicators').should('be.visible');
          cy.contains('app-slb app-tab-buttons button', 'Water Supply').should('have.class', 'btn-cfPrimary');
          cy.get('app-slb mat-select').should('contain.text', years[0]);
          const data = response!.body.data;
          assertCharts(data);
          cy.get('app-slb .d-flex.flex-wrap.py-1 > div').then(($l) => {
            expect([...$l].map((l) => norm(l.textContent || ''))).to.deep.eq([
              'Benchmark', 'National avg', data[0].ulbName, 'ULB performance is better than National avg',
            ]);
          });
          if (Number(years[0].slice(0, 4)) > 2021) cy.contains('p', 'Data shown here is based on submissions made by the ULBs').should('exist');
          else cy.contains('Data shown here is based on submissions made by the ULBs').should('not.exist');
        });
      });
    });
  });

  [
    ['Waste Water Management', 'sanitation'],
    ['Solid Waste Management', 'solid waste'],
    ['Storm Water Drainage', 'storm water'],
  ].forEach(([label, type]) => {
    it(`"${label}" theme fetches type=${type} and redraws the gauges`, () => {
      visitSlb();
      cy.wait('@slb');
      cy.contains('app-slb app-tab-buttons button', label).click();
      cy.contains('app-slb app-tab-buttons button', label).should('have.class', 'btn-cfPrimary');
      // The theme change triggers a reload via the year form; wait for the type-specific call.
      cy.wait('@slb').then(({ request, response }) => {
        expect(decodeURIComponent(request.url)).to.contain(`type=${type}`);
        assertCharts(response!.body.data);
      });
    });
  });

  it('Compare by: no-results search (negative), then compare with another ULB and reset', () => {
    cy.intercept('POST', '**/api/v1/recentSearchKeyword/search*').as('search');
    visitSlb();
    cy.wait('@slb');
    // Keep the input clear of the sticky site header before typing.
    // The floating mat-label overlays the empty input; force targets the same control.
    cy.get('app-slb app-city-search input').type('zzqqxx-none', { scrollBehavior: 'center', force: true });
    cy.wait('@search');
    cy.contains('mat-option', 'No results found.').should('be.visible');
    cy.get('app-slb app-city-search input').clear({ scrollBehavior: 'center', force: true }).type(SAME_STATE_CITY, { scrollBehavior: 'center', force: true });
    cy.wait('@search').its('response.body.data').then((ulbs: any[]) => {
      const other = ulbs.find((u) => u.name === `${SAME_STATE_CITY} Municipal Corporation`);
      cy.contains('mat-option', other.name).click();
      cy.wait('@slb').then(({ request, response }) => {
        expect(request.url).to.contain(`compUlb=${other._id}`);
        cy.get('app-slb .d-flex.flex-wrap.py-1 > div').first().should(($l) => expect(norm($l.text())).to.eq(other.name));
        assertCharts(response!.body.data);
      });
      cy.get('app-slb app-city-search input').should('have.value', other.name);
      cy.get('app-slb i.bi-arrow-clockwise[aria-label="Reset search"]').click({ scrollBehavior: 'center' });
      cy.wait('@slb').its('request.url').should('not.contain', `compUlb=${other._id}`);
      cy.get('app-slb .d-flex.flex-wrap.py-1 > div').first().should(($l) => expect(norm($l.text())).to.eq('Benchmark'));
      cy.get('app-slb app-city-search input').should('have.value', '');
    });
  });

  it('Financial years dropdown refetches SLBs for the chosen year (city with 2+ SLB years)', () => {
    // Amdavad has two SLB years on staging.
    cityDetails('amdavad').then((c: any) => {
      cy.request(`${API}/common/get-latest-slbs-year?ulb=${c.ulbId}&fetchCeptYears=true`).its('body.slbYears').then((years: string[]) => {
        if (years.length < 2) { cy.log('Needs 2 SLB years'); return; }
        visitSlb('amdavad');
        cy.wait('@slb');
        cy.get('app-slb mat-select').click();
        cy.get('mat-option').then(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.eq(years));
        cy.contains('mat-option', years[1]).click();
        cy.wait('@slb').then(({ request, response }) => {
          expect(request.url).to.contain(`year=${years[1]}`);
          assertCharts(response!.body.data);
        });
      });
    });
  });
});
