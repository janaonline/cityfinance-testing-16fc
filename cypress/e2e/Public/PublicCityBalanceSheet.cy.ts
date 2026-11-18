/**
 * Public (logged-out) City Dashboard — Balance Sheet & Income Statement tab.
 * URL: /municipal-data/city/:slug  (staging city: pune)
 *
 * Built from the cf-ui-ssr-v3 `staging` branch (src/app/pages/dashboard/city/**,
 * dashboard-service.ts, shared/components/**) and cf-nest-api-v2 response
 * shapes; checked against staging. Read-only: the only POSTs are the page's
 * ULB search lookups. Expected values come from intercepted API responses
 * (or cy.request where the page hydrates from SSR TransferState and makes no
 * browser call); only static UI text is hard-coded.
 *
 * Covers: BS/IS switch, report type, value format, number format, keyword
 * search (incl. no results), compare-by dialog validation/apply, reset, XLSX,
 * methodology PDF link and the AFS PDF/Excel dialogs.
 */
import {
  API, SLUG, SAME_STATE_CITY, EMPTY_SLUG, inr, norm, stripHtml, threeYears, snackbar, cityDetails,
  interceptCommon, visitCity, tab, openTab, treeNode, fpCellText, assertTree, chartTitle, chartTitleIs, expectedWarning,
} from './cityDashboardHelpers';

export {}; // Own module scope so top-level names don't collide across specs.

describe('Public | City dashboard — Balance Sheet & Income Statement tab', () => {
  const DATA_TABLE = 'app-balancesheet-incomestatement .table-container table';
  const REPORT_TABLE = 'app-balancesheet-incomestatement .overflow-x-auto table';
  const ROWS = `${DATA_TABLE} tr.mat-mdc-row`;

  /** Alias each ULB search by its term so a test waits for the call it triggered. */
  function interceptSearch() {
    cy.intercept('POST', '**/api/v1/recentSearchKeyword/search*', (req) => {
      req.alias = `search_${req.body?.matchingWord}`;
    });
  }

  function searchPick(term: string, option: string) {
    cy.get('mat-dialog-container #ulbName').clear().type(term);
    cy.wait(`@search_${term}`);
    cy.contains('mat-option', option).should('be.visible').click();
  }

  function visitBs() {
    cy.intercept('GET', '**/api/v1/dashboard/city/bs-is*').as('bsis');
    // Open the tab client-side: with ?tabIndex=1 the SSR render fetches bs-is and
    // Angular's HTTP transfer cache replays it, so the browser makes no request.
    visitCity();
    openTab('Balance Sheet & Income Statement');
  }

  /** Visible rows for a given reportType, in API order. */
  const visibleRows = (data: any[], rt: string) => data.filter((r) => !r.reportType || r.reportType === rt);

  function lineCell(lineItem: string) {
    return cy.get(ROWS).filter((_, el) => norm(el.querySelectorAll('td')[1]?.textContent || '') === lineItem).first();
  }

  it('defaults to Summary Balance Sheet for all ledger years; headers, population and values match the API', () => {
    visitBs();
    cityDetails().then((c: any) => {
      cy.request(`${API}/common/get-latest-standardized-year?ulbId=${c.ulbId}`).its('body.ledgerYears').then((years: string[]) => {
        cy.wait('@bsis').then(({ request, response }) => {
          const u = request.url;
          expect(u).to.contain('btnKey=balanceSheet').and.contain(`selectedUlb=${c.ulbId}`).and.contain(`ulbIds=${c.ulbId}`);
          years.forEach((y) => expect(u).to.contain(`years=${y}`));
          const res = response!.body;
          tab('Balance Sheet & Income Statement').should('have.attr', 'aria-selected', 'true');
          cy.contains('app-balancesheet-incomestatement button', 'Balance Sheet').should('have.class', 'btn-cfPrimary');
          cy.contains('.bg-table-header', 'Summary Balance Sheet').should('be.visible');
          cy.get('#summary').should('be.checked');
          cy.get('#absolute').should('be.checked');
          cy.get('#currencyFormat').should('have.value', 'inr').and('not.be.disabled');
          cy.get(`${DATA_TABLE} th`).then(($th) => {
            expect([...$th].map((t) => norm(t.textContent || ''))).to.deep.eq(['Account Code', 'Major Group/Minor Group', ...years]);
          });
          cy.contains('p', 'Population (Source: Census 2011)').should('be.visible');
          Object.values(res.ulbsData).forEach((u2: any) => {
            cy.contains('p', `(${u2.name}, ${u2.stateName})`).should('contain.text', inr(u2.population, 'inr', { showSymbol: false, showUnit: false }));
          });
          const rows = visibleRows(res.data, 'summary');
          cy.get(ROWS).should('have.length', rows.length);
          const sample = rows.find((r) => r.isNumber && r.lineItem && years.some((y) => r[`${y.replace('-', '')}_${c.ulbId}`] !== undefined));
          lineCell(sample.lineItem).find('td').then(($td) => {
            years.forEach((y, i) => {
              expect(norm($td[2 + i].textContent || ''), `${sample.lineItem} ${y}`)
                .to.eq(inr(sample[`${y.replace('-', '')}_${c.ulbId}`], 'inr', { showSymbol: false, showUnit: false }));
            });
          });
          const withInfo = rows.find((r) => r.info);
          if (withInfo) lineCell(withInfo.lineItem).find('i.bi-info-circle').should('exist');
        });
      });
    });
  });

  it('Income Statement button fetches btnKey=incomeStatement and retitles the table', () => {
    visitBs();
    cy.wait('@bsis');
    cy.contains('app-balancesheet-incomestatement app-tab-buttons button', 'Income Statement').click();
    cy.wait('@bsis').then(({ request, response }) => {
      expect(request.url).to.contain('btnKey=incomeStatement');
      cy.contains('.bg-table-header', 'Summary Income Statement').should('be.visible');
      cy.get(ROWS).should('have.length', visibleRows(response!.body.data, 'summary').length);
    });
  });

  it('Report Type "Detailed" shows the detailed rows without a new request', () => {
    visitBs();
    cy.wait('@bsis').its('response.body.data').then((data: any[]) => {
      cy.get('#detailed').check();
      cy.contains('.bg-table-header', 'Detailed Balance Sheet').should('be.visible');
      cy.get(ROWS).should('have.length', visibleRows(data, 'detailed').length);
      cy.get('#summary').check();
      cy.get(ROWS).should('have.length', visibleRows(data, 'summary').length);
    });
  });

  it('"Per Capita" divides by population and locks currency to INR; "Absolute" unlocks it', () => {
    visitBs();
    cityDetails().then((c: any) => {
      cy.wait('@bsis').its('response.body').then((res: any) => {
        cy.get('#currencyFormat').select('cr');
        cy.get('#perCapita').check();
        cy.get('#currencyFormat').should('be.disabled').and('have.value', 'inr');
        const row = visibleRows(res.data, 'summary').find((r) => r.isNumber && Object.keys(r).some((k) => k.endsWith(c.ulbId) && typeof r[k] === 'number' && r[k] !== 0));
        const key = Object.keys(row).find((k) => k.endsWith(c.ulbId) && typeof row[k] === 'number' && row[k] !== 0)!;
        const yearLabel = `${key.slice(0, 4)}-${key.slice(4, 6)}`;
        cy.get(`${DATA_TABLE} th`).then(($th) => {
          const col = [...$th].findIndex((t) => norm(t.textContent || '') === yearLabel);
          lineCell(row.lineItem).find('td').eq(col).should(($td) =>
            expect(norm($td.text())).to.eq(inr(row[key] / res.population, 'inr', { showSymbol: false, showUnit: false })));
        });
        cy.get('#absolute').check();
        cy.get('#currencyFormat').should('not.be.disabled');
      });
    });
  });

  (['k', 'lakh', 'cr'] as const).forEach((fmt) => {
    it(`"Display Numbers In" = ${fmt} reformats the figures`, () => {
      visitBs();
      cityDetails().then((c: any) => {
        cy.wait('@bsis').its('response.body.data').then((data: any[]) => {
          const row = visibleRows(data, 'summary').find((r) => r.isNumber && typeof r[Object.keys(r).find((k) => k.endsWith(c.ulbId))!] === 'number');
          const key = Object.keys(row).find((k) => k.endsWith(c.ulbId) && typeof row[k] === 'number')!;
          const yearLabel = `${key.slice(0, 4)}-${key.slice(4, 6)}`;
          cy.get('#currencyFormat').select(fmt);
          cy.get(`${DATA_TABLE} th`).then(($th) => {
            const col = [...$th].findIndex((t) => norm(t.textContent || '') === yearLabel);
            lineCell(row.lineItem).find('td').eq(col).should(($td) =>
              expect(norm($td.text())).to.eq(inr(row[key], fmt, { showSymbol: false, showUnit: false })));
          });
        });
      });
    });
  });

  it('keyword search filters rows; a non-matching term shows the no-results row (negative)', () => {
    visitBs();
    cy.wait('@bsis').its('response.body.data').then((data: any[]) => {
      cy.get('#filterInput').should('have.attr', 'placeholder', 'Ex. Liabilities or Income').type('Loans');
      cy.get(ROWS).should('have.length.greaterThan', 0).each(($r) => expect($r.text().toLowerCase()).to.contain('loans'));
      cy.get('#filterInput').clear().type('zzqq-no-such-line');
      cy.get(ROWS).should('have.length', 0);
      cy.contains('td', 'No results found for the applied filter.').should('be.visible');
      cy.get('#filterInput').clear().type('{backspace}');
      cy.get(ROWS).should('have.length', visibleRows(data, 'summary').length);
    });
  });

  it('Compare-by dialog: validation messages, search (incl. no results), chips, duplicates and dialog Reset', () => {
    interceptSearch();
    visitBs();
    cy.wait('@bsis');
    cy.contains('app-balancesheet-incomestatement button', 'Compare by').click();
    cy.get('mat-dialog-container').should('be.visible').within(() => {
      cy.contains('Compare up to 3 ULBs across 3 years.').should('be.visible');
      cy.get('.badge').should('have.length', 1).and('contain.text', 'Pune Municipal Corporation');
      cy.get('.badge button').should('not.exist'); // default ULB can't be removed
      cy.contains('button', 'Apply').click();
    });
    snackbar('Atleast 1 ULB must be selected!');
    cy.get('mat-dialog-container #ulbName').type('zzqqxx-none');
    cy.wait('@search_zzqqxx-none').its('request.url').should('contain', 'type=ulb');
    cy.contains('mat-option', 'No results found.').should('be.visible');
    searchPick(SAME_STATE_CITY, `${SAME_STATE_CITY} Municipal Corporation`);
    cy.get('mat-dialog-container .badge').should('have.length', 2).last().should('contain.text', `${SAME_STATE_CITY} Municipal Corporation`);
    cy.get('mat-dialog-container #ulbName').should('have.value', '');
    // apply without a year
    cy.contains('mat-dialog-container button', 'Apply').click();
    snackbar('Atleast 1 Year must be selected!');
    // third ULB, then a fourth → max 3
    searchPick('Thane', 'Thane Municipal Corporation');
    cy.get('mat-dialog-container .badge').should('have.length', 3);
    searchPick('Nashik', 'Nashik Municipal Corporation');
    snackbar('Maximum of 3 ULBs can be selected!');
    cy.get('mat-dialog-container .badge').should('have.length', 3);
    // remove chip
    cy.get('mat-dialog-container .badge').eq(2).find('button[aria-label="Close"]').click();
    cy.get('mat-dialog-container .badge').should('have.length', 2);
    // duplicate
    searchPick('Thane', 'Thane Municipal Corporation');
    cy.get('mat-dialog-container .badge').should('have.length', 3);
    searchPick('Solapur', 'Solapur Municipal Corporation');
    snackbar('Maximum of 3 ULBs can be selected!');
    cy.get('mat-dialog-container .badge').eq(2).find('button[aria-label="Close"]').click();
    searchPick(SAME_STATE_CITY, `${SAME_STATE_CITY} Municipal Corporation`);
    snackbar('ULB already selected!');
    cy.get('mat-dialog-container .badge').should('have.length', 2);
    // 4 years → max 3
    cy.get('mat-dialog-container mat-select').click();
    cy.get('mat-option').should('have.length.greaterThan', 3);
    [0, 1, 2, 3].forEach((i) => cy.get('mat-option').eq(i).click());
    cy.get('mat-option[aria-selected="true"]').should('have.length', 4);
    cy.get('body').type('{esc}');
    cy.contains('mat-dialog-container button', 'Apply').click();
    snackbar('Maximum of 3 Years can be selected!');
    cy.get('mat-dialog-container').should('be.visible');
    // dialog Reset → only the default ULB
    cy.contains('mat-dialog-container button', 'Reset').click();
    cy.get('mat-dialog-container .badge').should('have.length', 1);
  });

  it('Compare-by Apply fetches both ULBs for the chosen years; page Reset restores the single-ULB view', () => {
    interceptSearch();
    visitBs();
    cityDetails().then((c: any) => {
      cy.wait('@bsis');
      cy.contains('app-balancesheet-incomestatement button', 'Compare by').click();
      cy.get('mat-dialog-container #ulbName').type(SAME_STATE_CITY);
      cy.wait(`@search_${SAME_STATE_CITY}`).its('response.body.data').then((ulbs: any[]) => {
        const other = ulbs.find((u) => u.name === `${SAME_STATE_CITY} Municipal Corporation`);
        cy.contains('mat-option', other.name).click();
        cy.get('mat-dialog-container mat-select').click();
        cy.get('mat-option').then(($o) => {
          const picked = [...$o].slice(0, 2).map((o) => norm(o.textContent || ''));
          cy.get('mat-option').eq(0).click();
          cy.get('mat-option').eq(1).click();
          cy.get('body').type('{esc}');
          cy.contains('mat-dialog-container button', 'Apply').click();
          cy.get('mat-dialog-container').should('not.exist');
          cy.wait('@bsis').then(({ request, response }) => {
            expect(request.url).to.contain(`ulbIds=${c.ulbId}`).and.contain(`ulbIds=${other._id}`);
            picked.forEach((y) => expect(request.url).to.contain(`years=${y}`));
            cy.get(`${DATA_TABLE} th`).should('have.length', 2 + picked.length * 2);
            Object.values(response!.body.ulbsData).forEach((u: any) => cy.contains('p', `(${u.name}, ${u.stateName})`).should('exist'));
          });
        });
        cy.contains('app-balancesheet-incomestatement div[role="button"]', 'Reset').click();
        cy.wait('@bsis').then(({ request }) => {
          expect(request.url).not.to.contain(other._id);
          expect(request.url).to.contain(`ulbIds=${c.ulbId}`);
        });
        cy.request(`${API}/common/get-latest-standardized-year?ulbId=${c.ulbId}`).its('body.ledgerYears').then((years: string[]) => {
          cy.get(`${DATA_TABLE} th`).should('have.length', 2 + years.length);
        });
      });
    });
  });

  it('"Download as XLSX" builds an .xlsx blob client-side', () => {
    visitBs();
    cy.wait('@bsis');
    cy.window().then((win) => cy.spy(win.URL, 'createObjectURL').as('blobUrl'));
    cy.get(ROWS).should('have.length.greaterThan', 0);
    cy.contains('app-balancesheet-incomestatement button', 'Download as XLSX').click();
    cy.get('@blobUrl').should('have.been.called').then((spy: any) => {
      const blob = spy.getCalls().map((c: any) => c.args[0]).find((b: any) => b && typeof b.type === 'string' && typeof b.size === 'number');
      expect(blob.type).to.eq('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(blob.size).to.be.greaterThan(1000);
    });
  });

  it('"How We Standardize Annual Financial Statements?" links to the methodology PDF in a new tab', () => {
    visitBs();
    cy.contains('a', 'How We Standardize Annual Financial Statements?')
      .should('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener noreferrer')
      .invoke('attr', 'href')
      .then((href) => {
        expect(href).to.match(/^\/assets\/docs\/STANDARDIZATION_PROCESS_OF_ANNUAL_FINANCIAL_STATEMENT_OF_ULBS_.*\.pdf$/);
        cy.request(href as string).then((r) => {
          expect(r.status).to.eq(200);
          expect(r.headers['content-type']).to.contain('application/pdf');
        });
      });
    cy.contains('p', '* PDF consists of final financial dataset as published by the ULB.').should('be.visible');
  });

  /** Click a Raw PDF / Raw Excel icon in the Download Report table for `year`. */
  function clickReport(kind: 'pdf' | 'excel', year: string) {
    cy.get(REPORT_TABLE).within(() => {
      cy.get('th').then(($th) => {
        const col = [...$th].findIndex((t) => norm(t.textContent || '') === year);
        expect(col, `column for ${year}`).to.be.greaterThan(0);
        cy.contains('tr', kind === 'pdf' ? 'Raw PDF' : 'Raw Excel').find('td').eq(col)
          .find(`button[aria-label="${kind === 'pdf' ? 'Open PDF' : 'Open Excel'}"]`).click();
      });
    });
  }

  it('Download Report table has a Raw PDF and Raw Excel icon per ledger year', () => {
    visitBs();
    cityDetails().then((c: any) => {
      cy.request(`${API}/common/get-latest-standardized-year?ulbId=${c.ulbId}`).its('body.ledgerYears').then((years: string[]) => {
        cy.get(REPORT_TABLE).within(() => {
          cy.get('th').then(($th) => expect([...$th].map((t) => norm(t.textContent || ''))).to.deep.eq(['Download Report', ...years]));
          cy.contains('tr', 'Raw PDF').find('button[aria-label="Open PDF"]').should('have.length', years.length);
          cy.contains('tr', 'Raw Excel').find('button[aria-label="Open Excel"]').should('have.length', years.length);
        });
      });
    });
  });

  /** Ledger years (2019+) split by whether the AFS files API answers success. */
  function afsYears(ulbId: string) {
    return cy.request(`${API}/common/get-latest-standardized-year?ulbId=${ulbId}`).its('body.ledgerYears').then((years: string[]) => {
      const recent = years.filter((y) => Number(y.slice(0, 4)) >= 2019);
      const ok: string[] = [];
      const failing: string[] = [];
      recent.forEach((y) => {
        cy.request({ url: `${API}/ledger/ulb-financial-data/files/${ulbId}?financialYear=${y}&auditType=`, failOnStatusCode: false }).then((r) => {
          (r.status === 200 && r.body?.success ? ok : failing).push(y);
        });
      });
      return cy.then(() => ({ ok, failing }));
    });
  }

  it('Raw PDF (2019+) opens the AFS dialog listing the files; a file opens in a new tab', () => {
    cy.intercept('GET', '**/api/v1/ledger/ulb-financial-data/files/*').as('afs');
    visitBs();
    cityDetails().then((c: any) => {
      afsYears(c.ulbId).then(({ ok }) => {
        if (!ok.length) { cy.log('AFS files API fails for every year'); return; }
        const year = ok[0];
        cy.window().then((win) => cy.stub(win, 'open').as('open'));
        clickReport('pdf', year);
        cy.wait('@afs').then(({ request, response }) => {
          expect(request.url).to.contain(`/files/${c.ulbId}?financialYear=${year}`);
          const d = response!.body.data;
          cy.get('mat-dialog-container').should('be.visible');
          cy.get('mat-dialog-container app-afs-pdfs-dialog').within(() => {
            if (!d.pdf.length) { cy.contains('No Data Found for chosen options').should('be.visible'); return; }
            cy.contains('h5', 'PDF').should('be.visible');
            cy.get('button').should('have.length', d.pdf.length);
            d.pdf.forEach((p: any, i: number) => cy.get('button').eq(i).should('contain.text', p.name));
            cy.contains('i', `Source: ${d.type === 'audited' ? 'Audited' : 'Provisional'} File(s) submitted by ULB`).should('be.visible');
            cy.get('button').first().click();
          });
          if (d.pdf.length) {
            const u = d.pdf[0].url;
            const expected = /^https?:\/\//i.test(u) ? u : `https://jana-cityfinance-stg.s3.ap-south-1.amazonaws.com${u}`;
            cy.get('@open').should('have.been.calledWith', expected, '_blank');
          }
        });
      });
    });
  });

  it('Raw Excel (2019+) opens the AFS dialog in Excel mode (or no-data)', () => {
    cy.intercept('GET', '**/api/v1/ledger/ulb-financial-data/files/*').as('afs');
    visitBs();
    cityDetails().then((c: any) => {
      afsYears(c.ulbId).then(({ ok }) => {
        if (!ok.length) { cy.log('AFS files API fails for every year'); return; }
        const year = ok[0];
        clickReport('excel', year);
        cy.wait('@afs').its('response.body.data').then((d: any) => {
          cy.get('mat-dialog-container app-afs-pdfs-dialog').within(() => {
            if (d.excel.length) {
              cy.contains('h5', 'EXCEL').should('be.visible');
              d.excel.forEach((x: any, i: number) => cy.get('button').eq(i).should('contain.text', x.name));
            } else {
              cy.contains('No Data Found for chosen options').should('be.visible');
            }
          });
          cy.get('body').type('{esc}');
          cy.get('mat-dialog-container').should('not.exist');
        });
      });
    });
  });

  it('Raw PDF for a year whose AFS files API fails opens no dialog (negative; known staging bug)', () => {
    cy.intercept('GET', '**/api/v1/ledger/ulb-financial-data/files/*').as('afs');
    visitBs();
    cityDetails().then((c: any) => {
      afsYears(c.ulbId).then(({ failing }) => {
        if (!failing.length) { cy.log('AFS files API succeeds for every year — nothing to check'); return; }
        clickReport('pdf', failing[0]);
        cy.wait('@afs').then(({ response }) => {
          expect(response!.statusCode).to.eq(400);
          expect(response!.body.success).to.eq(false);
          expect(response!.body.message).to.eq('Something went wrong.');
        });
        // The component only console.errors the failure — no dialog, no snackbar.
        cy.get('mat-dialog-container').should('not.exist');
      });
    });
  });

  it('Raw PDF for a pre-2019 year uses annual-accounts datasets (opens file, or no-data dialog)', () => {
    cy.intercept('GET', '**/api/v1/annual-accounts/datasets*').as('datasets');
    visitBs();
    cityDetails().then((c: any) => {
      cy.request(`${API}/common/get-latest-standardized-year?ulbId=${c.ulbId}`).its('body.ledgerYears').then((years: string[]) => {
        const year = years.find((y) => Number(y.slice(0, 4)) < 2019);
        if (!year) { cy.log('No pre-2019 ledger year'); return; }
        cy.wait('@bsis');
        cy.window().then((win) => cy.stub(win, 'open').as('open'));
        clickReport('pdf', year);
        cy.wait('@datasets').then(({ request, response }) => {
          expect(request.url).to.contain(`year=${year}`).and.contain('type=pdf').and.contain('category=balance').and.contain(`ulbId=${c.ulbId}`);
          const d = response!.body.data;
          if (!d.length) cy.contains('mat-dialog-container', 'No Data Found for chosen options').should('be.visible');
          else cy.get('@open').should('have.been.calledWith', Cypress.sinon.match(String(d[0].fileUrl).replace(/^https?:\/\/[^/]+/, '')), '_blank');
        });
      });
    });
  });
});
