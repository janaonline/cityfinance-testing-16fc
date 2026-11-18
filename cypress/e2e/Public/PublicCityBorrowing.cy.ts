/**
 * Public (logged-out) City Dashboard — Borrowing & Credit Rating tab.
 * URL: /municipal-data/city/:slug  (staging city: pune)
 *
 * Built from the cf-ui-ssr-v3 `staging` branch (src/app/pages/dashboard/city/**,
 * dashboard-service.ts, shared/components/**) and cf-nest-api-v2 response
 * shapes; checked against staging. Read-only: the only POSTs are the page's
 * ULB search lookups. Expected values come from intercepted API responses
 * (or cy.request where the page hydrates from SSR TransferState and makes no
 * browser call); only static UI text is hard-coded.
 *
 * Covers: bond tables + pagination, credit ratings by year, no-data state,
 * Market Readiness doughnuts/score table/year switch, ?subTabIndex deep link.
 */
import {
  API, SLUG, SAME_STATE_CITY, EMPTY_SLUG, inr, norm, stripHtml, threeYears, snackbar, cityDetails,
  interceptCommon, visitCity, tab, openTab, treeNode, fpCellText, assertTree, chartTitle, chartTitleIs, expectedWarning,
} from './cityDashboardHelpers';

export {}; // Own module scope so top-level names don't collide across specs.

describe('Public | City dashboard — Borrowing & Credit Rating tab', () => {
  function visitBorrow(slug = SLUG, qs = '') {
    cy.intercept('GET', '**/api/v1/common/get-latest-borrowings-year*').as('bYears');
    cy.intercept('GET', '**/api/v1//BondIssuerItem*').as('bonds');
    cy.intercept('GET', '**/api/v1/ledger/market-readiness-data-by-ulb*').as('mr');
    cy.intercept('GET', '**/assets/files/credit-rating-new.json').as('ratings');
    visitCity(slug, qs);
    // Without a deep link, open the tab client-side so its requests are made by
    // the browser (SSR + HTTP transfer cache would otherwise replay them).
    if (!qs) openTab('Borrowing & Credit Rating');
  }

  const LABELS: Record<string, string> = {
    typeOfInstruments: 'Type Of Instruments', couponRate: 'Coupon Rate', dateOfIssue: 'Date Of Issue',
    maturityDate: 'Maturity Date', issueSize: 'Issue Size', platform: 'Platform',
  };

  it('Borrowing shows bond issuance tables built from BondIssuerItem; Prev/Next disabled on a single page', () => {
    visitBorrow();
    tab('Borrowing & Credit Rating').should('have.attr', 'aria-selected', 'true');
    cy.wait('@bYears').its('response.body.borrowingYears').then((by: string[]) => {
      if (!by.length) { cy.contains('No Data Found for chosen options').should('be.visible'); return; }
      cy.wait('@bonds').its('response.body.data').then((bonds: any[]) => {
        cy.contains('p', 'Below are the details of Municipal Bond Issuances undertaken by the ULB').should('be.visible');
        ['Details Of Instrument', 'Details Of Issue'].forEach((h) => cy.contains('app-borrowing-credit-rating h5', h).should('be.visible'));
        Object.entries(LABELS).forEach(([k, label]) => {
          cy.contains('app-borrowing-credit-rating td', new RegExp(`^\\s*${label}\\s*$`)).parent('tr').find('td').eq(1)
            .should(($td) => expect(norm($td.text())).to.eq(norm(String(bonds[0][k] || '-'))));
        });
        const pages = Math.ceil(bonds.length / 3);
        cy.get('app-borrowing-credit-rating nav.pagination').within(() => {
          cy.contains('button', 'Prev').should('be.disabled');
          if (pages <= 1) cy.contains('button', 'Next').should('be.disabled');
        });
      });
    });
  });

  it('Borrowing pagination pages through 3 bonds at a time (city with >3 bonds)', () => {
    // Amdavad has several bond issues on staging.
    visitBorrow('amdavad');
    cy.wait('@bonds').its('response.body.data').then((bonds: any[]) => {
      if (bonds.length <= 3) { cy.log('Not enough bonds for pagination'); return; }
      const firstRowCells = () => cy.contains('app-borrowing-credit-rating td', /^\s*Type Of Instruments\s*$/).parent('tr').find('td');
      firstRowCells().should('have.length', 4);
      firstRowCells().eq(1).should(($td) => expect(norm($td.text())).to.eq(norm(bonds[0].typeOfInstruments || '-')));
      cy.contains('nav.pagination button', 'Next').should('not.be.disabled').click();
      firstRowCells().eq(1).should(($td) => expect(norm($td.text())).to.eq(norm(bonds[3].typeOfInstruments || '-')));
      cy.contains('nav.pagination button', 'Prev').should('not.be.disabled').click();
      firstRowCells().eq(1).should(($td) => expect(norm($td.text())).to.eq(norm(bonds[0].typeOfInstruments || '-')));
      cy.get('nav.pagination button.active').should('have.text', ' 0 ').and(($b) => expect(norm($b.text())).to.eq('0'));
      const last = Math.ceil(bonds.length / 3) - 1;
      cy.get('nav.pagination button').filter((_, b) => norm(b.textContent || '') === String(last)).click();
      cy.contains('nav.pagination button', 'Next').should('be.disabled');
      firstRowCells().eq(1).should(($td) => expect(norm($td.text())).to.eq(norm(bonds[last * 3].typeOfInstruments || '-')));
    });
  });

  it('Credit Rating lists the ULB\'s ratings by year from credit-rating-new.json; year switch filters; report links open in a new tab', () => {
    visitBorrow();
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Credit Rating').click();
    cy.wait('@ratings').its('response.body').then((all: any[]) => {
      const mine = all.filter((r) => r.ulb === 'Pune Municipal Corporation' && r.date?.includes('/'));
      if (!mine.length) { cy.contains('No Data Found for chosen options').should('be.visible'); return; }
      const yearOf = (d: string) => d.split('/')[2];
      const years = Array.from(new Set(mine.map((r) => yearOf(r.date)))).sort((a, b) => b.localeCompare(a));
      cy.get('#creditRatingYears option').then(($o) => expect([...$o].map((o) => (o as HTMLOptionElement).value)).to.deep.eq(years));
      const check = (y: string) => {
        const rows = mine.filter((r) => yearOf(r.date) === y);
        // Retrying callback: the table re-renders in place after a year switch.
        cy.contains('h4', 'Credit Rating').next('div').find('tbody tr').should(($trs) => {
          expect($trs).to.have.length(rows.length);
          [...$trs].forEach((tr, i) => {
            const td = Cypress.$(tr).find('td');
            expect(norm(td.eq(0).text())).to.eq(`${i + 1}.`);
            expect(norm(td.eq(1).text())).to.eq(rows[i].agency);
            expect(norm(td.eq(2).text())).to.eq(rows[i].creditRating);
            const a = td.eq(3).find('a');
            expect(a.text()).to.contain('View Full Report');
            expect(a.attr('href')).to.eq(rows[i].link);
            expect(a.attr('target')).to.eq('_blank');
          });
        });
      };
      cy.get('#creditRatingYears').should('have.value', years[0]);
      check(years[0]);
      if (years.length > 1) {
        cy.get('#creditRatingYears').select(years[years.length - 1]);
        check(years[years.length - 1]);
      }
    });
  });

  it('Credit Rating shows "No Data Found" for a ULB without ratings (negative)', () => {
    visitBorrow(EMPTY_SLUG);
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Credit Rating').click();
    cy.contains('app-borrowing-credit-rating', 'No Data Found for chosen options').should('be.visible');
  });

  it('Market Readiness renders doughnuts and the indicator score table from the API', () => {
    visitBorrow();
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Market Readiness').click();
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Market Readiness').should('have.class', 'btn-cfPrimary');
    cy.wait('@mr').then(({ request, response }) => {
      expect(request.url).to.contain('ulbId=5eb5844f76a3b61f40ba0694').and.contain('year=2022-23');
      const r = response!.body;
      if (r.message === 'Data not found for the specified ULB and years') {
        cy.contains("Pune Municipal Corporation's Data not available for the selected Year").should('be.visible');
        return;
      }
      cy.contains('p', "Pune Municipal Corporation's credit profile").should('be.visible');
      cy.get('app-borrowing-credit-rating mat-select').should('contain.text', '2022-23');
      const titles = ['Overall Score', ...r.sectionScores.map((s: any) => s.section.split('(')[0].trim())];
      cy.get('app-borrowing-credit-rating .chart-title').then(($t) => {
        expect([...$t].map((t) => norm(t.textContent || ''))).to.deep.eq(titles);
      });
      cy.get('app-borrowing-credit-rating .doughnut-wrapper canvas').should('have.length', titles.length);
      const fn = r.footNote;
      const insufficient = fn && typeof fn === 'object' && fn.isTotRevenueMissing === true && fn.sectionsMissing === true;
      const fnText = fn && typeof fn === 'object' ? fn.footNote : fn;
      if (fnText) cy.contains('.alert-warning', fnText).should('be.visible');
      if (insufficient) { cy.get('app-borrowing-credit-rating table.table').should('not.exist'); return; }
      cy.get('app-borrowing-credit-rating table.table thead th').then(($th) => {
        expect([...$th].map((t) => norm(t.textContent || ''))).to.deep.eq(['Indicators', 'Max Score', 'Highest', 'High', 'Low', 'Lowest']);
      });
      const cat = (s: any) => {
        if (s === 'N/A' || s == null || s === 0) return 'na';
        const n = Number(s);
        if (n >= 8 || n === 4) return 0;
        if (n >= 6 || n === 3) return 1;
        if (n >= 4 || n === 2) return 2;
        return 3;
      };
      r.sections.forEach((sec: any) => {
        cy.contains('app-borrowing-credit-rating tr.table-info td', sec.section).should('contain.text', sec.description);
        const derived = sec.section.includes('DEBT MANAGEMENT') && sec.rows?.some((x: any) => x.derived === true);
        if (derived) {
          cy.contains('td', 'debt-related indicators have not been calculated').should('be.visible');
          return;
        }
        sec.rows.forEach((row: any, i: number) => {
          cy.get('app-borrowing-credit-rating table.table tbody tr')
            .filter((_, tr) => norm(tr.querySelector('td')?.textContent || '') === row.name)
            .first().find('td').then(($td) => {
              expect(norm($td.eq(1).text()), `${row.name} max`).to.eq(String(row.maxScore));
              const prevZero = i > 0 && sec.rows[i - 1].score === 0;
              if (row.score === 0) {
                if (!prevZero) expect(norm($td.eq(2).text())).to.contain('Not scored');
              } else if (cat(row.score) === 'na') {
                expect(norm($td.eq(2).text())).to.eq('Data could not be sourced');
              } else {
                expect(norm($td.eq(2 + (cat(row.score) as number)).text()), `${row.name} score`).to.eq(String(row.score));
              }
            });
        });
      });
      cy.contains('a', 'CWAS-CRDF-CEPT Creditworthiness Assessment Framework (April 2024)')
        .should('have.attr', 'href', 'https://cwas.org.in/cwas-resources/creditworthiness-assessment-an-approach-for-indian-cities')
        .and('have.attr', 'target', '_blank');
    });
  });

  it('?tabIndex=2&subTabIndex=2 deep-links to Market Readiness (SSR-rendered, data from the API)', () => {
    cy.request(`${API}/ledger/market-readiness-data-by-ulb?ulbId=5eb5844f76a3b61f40ba0694&year=2022-23`).its('body').then((r: any) => {
      // SSR renders this tab and Angular's transfer cache replays its calls, so read the API directly.
      visitCity(SLUG, '?tabIndex=2&subTabIndex=2');
      tab('Borrowing & Credit Rating').should('have.attr', 'aria-selected', 'true');
      cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Market Readiness').should('have.class', 'btn-cfPrimary');
      if (r.message) { cy.contains('Data not available for the selected Year').should('be.visible'); return; }
      cy.contains('p', "Pune Municipal Corporation's credit profile").should('be.visible');
      const titles = ['Overall Score', ...r.sectionScores.map((x: any) => x.section.split('(')[0].trim())];
      cy.get('app-borrowing-credit-rating .chart-title').should(($t) => {
        expect([...$t].map((t) => norm(t.textContent || ''))).to.deep.eq(titles);
      });
    });
  });

  it('Market Readiness year dropdown refetches for 2021-22', () => {
    visitBorrow();
    cy.wait('@mr');
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Market Readiness').click();
    cy.get('app-borrowing-credit-rating mat-select').click();
    cy.get('mat-option').then(($o) => expect([...$o].map((o) => norm(o.textContent || ''))).to.deep.eq(['2022-23', '2021-22']));
    cy.contains('mat-option', '2021-22').click();
    cy.wait('@mr').then(({ request, response }) => {
      expect(request.url).to.contain('year=2021-22');
      if (response!.body.message) cy.contains('Data not available for the selected Year').should('be.visible');
      else cy.get('app-borrowing-credit-rating mat-select').should('contain.text', '2021-22');
    });
  });

  it('sub-tab buttons switch between Borrowing, Credit Rating and Market Readiness', () => {
    visitBorrow();
    cy.wait('@bonds');
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Borrowing').should('have.class', 'btn-cfPrimary');
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Market Readiness').click();
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Market Readiness').should('have.class', 'btn-cfPrimary');
    cy.contains('p', 'Below are the details of Municipal Bond Issuances').should('not.exist');
    cy.contains('What is the basis for the market-readiness assessment and scoring logic?').should('be.visible');
    cy.contains('app-borrowing-credit-rating app-tab-buttons button', 'Borrowing').click();
    cy.contains('p', 'Below are the details of Municipal Bond Issuances').should('be.visible');
  });
});
