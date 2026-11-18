/**
 * Public (logged-out) Resources → Datasets.
 * URLs: /v1/resources-dashboard/data-sets/{income_statement|balanceSheet|property_tax|municipal_borrowing}
 *
 * Built from the cityfinance-ng-ui `staging` branch (old Angular 14 app, served
 * under /v1): pages/resources-dashboard/data-sets (DataSetsComponent),
 * filter-component, shared user-info-dialog and balance-tabledialog — and
 * checked against staging.
 *
 * Expected values come from intercepted API responses (annual-accounts/datasets,
 * common/get-latest-aa-year, state, ledger/ulb-financial-data/files, ...), so the
 * spec holds whatever data staging has. Nothing is written: the user-info
 * ("Download") dialog is only validated and cancelled, and the one test that
 * exercises the real download path stubs the download-log POST so no personal
 * data or log entry ever reaches the server.
 */
export {};

const DS = '/v1/resources-dashboard/data-sets/income_statement';
const STATIC_YEARS = ['2019-20', '2018-19', '2017-18', '2016-17', '2015-16', '2025-26'];
const PRE_2019_YEAR = '2017-18'; // years < 2019-20 carry a direct fileUrl per row
const RE_DATASETS = /\/api\/v1\/annual-accounts\/datasets\?/;

type Row = {
  _id: string; fileName?: string; fileUrl?: string | null; modifiedAt?: string;
  state?: string; stateName?: string; type?: string; ulbName?: string; ulb?: string;
  year?: string; auditType?: string; section?: string;
};

const qs = (url: string) => new URL(url).searchParams;

function interceptAll() {
  cy.intercept('GET', '**/api/v1/common/get-latest-aa-year/**').as('aaYears');
  cy.intercept('GET', RE_DATASETS).as('datasets');
  cy.intercept('GET', /\/api\/v1\/state$/).as('states');
  cy.intercept('GET', '**/api/v1/file-download-log/userInfo').as('userInfoQuestions');
}

/** Visits the datasets page and yields the first (default-filter) datasets call. */
function visitDataSets(path = DS) {
  interceptAll();
  cy.visit(path);
  cy.wait('@aaYears');
  return cy.wait('@datasets');
}

function expectedYears(afsYears: string[]) {
  return Array.from(new Set([...afsYears, ...STATIC_YEARS])).sort((a, b) => b.localeCompare(a));
}

function selectMat(control: string, optionText: string) {
  cy.get(`mat-select[formcontrolname="${control}"]`).click();
  cy.get('.mat-select-panel mat-option')
    .contains(new RegExp(`^\\s*${optionText.replace(/[()]/g, '\\$&')}\\s*$`))
    .click();
}

function selectYear(year: string) {
  selectMat('year', year);
  return cy.wait('@datasets');
}

function selectFormat(label: string) {
  cy.contains('mat-card', label).find('label').first().click();
  return cy.wait('@datasets');
}

const visibleRows = (rows: Row[]) => rows.filter((r) => r.fileName);

function assertRowsMatch(rows: Row[]) {
  const shown = visibleRows(rows);
  if (!shown.length) {
    cy.contains('.empty', 'No data available for the selected filter').should('be.visible');
    cy.get('.cd-repeat').should('not.exist');
    return;
  }
  cy.get('.cd-repeat').should('have.length', shown.length);
  shown.forEach((r, i) => {
    cy.get('.cd-repeat').eq(i).within(() => {
      cy.get('.d-name').should('contain.text', r.fileName);
      cy.get(`img[alt="${r.type === 'excel' ? 'Excel Icon' : 'PDF Icon'}"]`).should('exist');
      if (r.modifiedAt) {
        const d = new Date(r.modifiedAt);
        const expected = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        cy.get('.d-date').should('contain.text', expected);
      }
    });
  });
}

/** Visits and switches to the pre-2019 year (which has rows on staging). */
function visitWithPre2019Rows(): Cypress.Chainable<Row[]> {
  visitDataSets();
  return selectYear(PRE_2019_YEAR).then(({ request, response }) => {
    expect(qs(request.url).get('year')).to.eq(PRE_2019_YEAR);
    const rows: Row[] = response.body.data;
    return visibleRows(rows);
  });
}

describe('Public | Resources — Datasets', () => {
  it('loads with default filters and lists the rows the API returns', () => {
    visitDataSets().then(({ request, response }) => {
      cy.get('@aaYears').its('response.body.afsYears').then((afsYears: string[]) => {
        const years = expectedYears(afsYears);
        const q = qs(request.url);
        expect(q.get('year'), 'default year = second entry of the year list').to.eq(years[1]);
        expect(q.get('type')).to.eq('Raw Data PDF');
        expect(q.get('category')).to.eq('balance');
        expect(q.get('fileType')).to.eq('Unaudited');
        expect(q.get('skip')).to.eq('0');
        expect(q.get('state')).to.eq('');
        cy.get('mat-select[formcontrolname="year"]').should('contain.text', years[1]);
      });
      cy.contains('h5', 'Filter By:').should('be.visible');
      cy.contains('mat-label', 'State Name').should('exist');
      cy.contains('mat-label', 'ULB Name').should('exist');
      cy.contains('mat-label', 'Financial Year').should('exist');
      cy.contains('.d-name', 'You can Download Upto 5 files').should('be.visible');
      cy.contains('.cd-h', 'Document Name').should('contain.text', 'Updated on');
      cy.contains('mat-card', 'Data submitted by ULBs').find('mat-radio-button')
        .should('have.class', 'mat-radio-checked');
      // Download button only appears once something is selected.
      cy.get('button[title="Download reports"]').should('not.exist');
      assertRowsMatch(response.body.data);
    });
  });

  it('offers the four data formats with their descriptions', () => {
    visitDataSets();
    cy.contains('h6', 'Choose Data Format:').should('be.visible');
    [
      ['Data submitted by ULBs', '(in PDF)'],
      ['ULB submitted documents digitized using OCR-AI methods', '(in Excel)'],
      ['Data standardized into NMAM format', '(in Excel)'],
      ['Budget data submitted by ULBs', '(in PDF)'],
    ].forEach(([label, desc]) => cy.contains('mat-card', label).should('contain.text', desc));
    cy.get('mat-radio-button').should('have.length', 4);
  });

  ['balanceSheet', 'income_statement', 'property_tax', 'municipal_borrowing'].forEach((sub) => {
    it(`renders the datasets view on /data-sets/${sub} with the Datasets card active`, () => {
      visitDataSets(`/v1/resources-dashboard/data-sets/${sub}`).then(({ request, response }) => {
        expect(request.url).to.match(RE_DATASETS);
        cy.location('pathname').should('eq', `/v1/resources-dashboard/data-sets/${sub}`);
        cy.contains('.res-card', 'Datasets').should('have.class', 'activeCard');
        cy.contains('.res-card', 'Learning Center').should('not.have.class', 'activeCard');
        assertRowsMatch(response.body.data);
      });
    });
  });

  it('year dropdown lists API + static years, newest first, and refetches on change', () => {
    visitDataSets();
    cy.get('@aaYears').its('response.body.afsYears').then((afsYears: string[]) => {
      const years = expectedYears(afsYears);
      cy.get('mat-select[formcontrolname="year"]').click();
      cy.get('.mat-select-panel mat-option').then(($o) => {
        expect([...$o].map((o) => o.innerText.trim())).to.deep.eq(years);
      });
      cy.get('.mat-select-panel mat-option').contains(PRE_2019_YEAR).click();
      cy.wait('@datasets').then(({ request, response }) => {
        expect(qs(request.url).get('year')).to.eq(PRE_2019_YEAR);
        cy.get('mat-select[formcontrolname="year"]').should('contain.text', PRE_2019_YEAR);
        assertRowsMatch(response.body.data);
      });
    });
  });

  it('shows the empty state for a year with no files', () => {
    visitDataSets();
    // 2025-26 is in the static list; skip if staging ever gets data for it.
    selectYear('2025-26').then(({ response }) => {
      if (visibleRows(response.body.data).length) {
        cy.log('2025-26 now has data — empty state not reachable this way');
        return;
      }
      cy.contains('.empty', 'No data available for the selected filter. Please select different option(s) to display result.')
        .should('be.visible');
      cy.get('.cd-repeat').should('not.exist');
      cy.contains('button', 'Load More').should('not.exist');
    });
  });

  it('Load More pages through results 10 at a time', function () {
    visitWithPre2019Rows().then((rows) => {
      if (rows.length < 10) {
        cy.log('Fewer than 10 rows — no Load More');
        cy.contains('button', 'Load More').should('not.exist');
        this.skip();
      }
      cy.get('.cd-repeat').should('have.length', 10);
      cy.contains('button', 'Load More').should('be.visible').click();
      cy.wait('@datasets').then(({ request, response }) => {
        const q = qs(request.url);
        expect(q.get('skip')).to.eq('10');
        expect(q.get('year')).to.eq(PRE_2019_YEAR);
        const next = visibleRows(response.body.data);
        cy.get('.cd-repeat').should('have.length', 10 + next.length);
        if (next.length) cy.get('.cd-repeat').eq(10).should('contain.text', next[0].fileName);
        if (response.body.data.length < 10) cy.contains('button', 'Load More').should('not.exist');
        else cy.contains('button', 'Load More').should('be.visible');
      });
    });
  });

  it('state filter sends the state id, narrows rows, and shows the state-bundle banner', function () {
    visitWithPre2019Rows().then((rows) => {
      if (!rows.length) { cy.log('No rows to derive a state from'); this.skip(); }
      const stateName = rows[0].state as string;
      cy.wait('@states').its('response.body.data').then((states: any[]) => {
        const st = states.find((s) => s.name === stateName);
        // UTs are filtered out of the dropdown.
        const nonUt = states.filter((s) => !s.isUT).map((s) => s.name).sort((a, b) => a.localeCompare(b));
        cy.get('mat-select[formcontrolname="state"]').click();
        cy.get('.mat-select-panel mat-option').then(($o) => {
          const names = [...$o].map((o) => o.innerText.trim());
          expect(names[0]).to.eq('All States');
          expect(names.slice(1)).to.deep.eq(nonUt);
        });
        cy.get('.mat-select-panel mat-option').contains(new RegExp(`^\\s*${stateName}\\s*$`)).click();
        cy.wait('@datasets').then(({ request, response }) => {
          expect(qs(request.url).get('state')).to.eq(st._id);
          expect(qs(request.url).get('year')).to.eq(PRE_2019_YEAR);
          const got = visibleRows(response.body.data);
          got.forEach((r) => expect(r.state).to.eq(stateName));
          assertRowsMatch(response.body.data);
        });
        cy.contains('mat-card.info-banner', `NEED DATA FOR ALL CITIES IN ${stateName.toUpperCase()}?`)
          .should('be.visible')
          .and('contain.text', `access ${stateName}'s data in one`);
        cy.contains('mat-card.info-banner button', 'Dismiss').click();
        cy.get('mat-card.info-banner').should('not.exist');
      });
    });
  });

  it('"Create state bundle" explains the email flow and opens the user-info dialog (cancelled)', function () {
    visitWithPre2019Rows().then((rows) => {
      if (!rows.length) this.skip();
      selectMat('state', rows[0].state as string);
      cy.wait('@datasets');
      cy.contains('button', 'Create state bundle').click();
      cy.get('#email-me').should('be.visible').within(() => {
        cy.contains('h6', 'How this works?');
        cy.contains("We'll send an OTP to your email. Please enter the OTP to confirm.");
        cy.contains('Download files anytime within 30 days.');
        cy.get('a[href="mailto:updates@cityfinance.in"]').should('exist');
      });
      // Digitized Excel card is hidden while a bundle is requested.
      cy.contains('mat-card', 'ULB submitted documents digitized').should('not.exist');
      // The per-file table is replaced by the bundle panel.
      cy.contains('You can Download Upto 5 files').should('not.exist');
      cy.contains('#email-me button', 'Email me the files').click();
      cy.get('mat-dialog-container app-user-info-dialog').should('be.visible');
      cy.wait('@userInfoQuestions');
      cy.contains('mat-dialog-container button', 'Cancel').click();
      cy.get('mat-dialog-container').should('not.exist');
      cy.get('#email-me').should('not.contain.text', 'A download link will be sent');
    });
  });

  it('state bundle for Standardised Excel downloads on the portal instead of emailing', function () {
    visitWithPre2019Rows().then((rows) => {
      if (!rows.length) this.skip();
      selectMat('state', rows[0].state as string);
      cy.wait('@datasets');
      cy.contains('button', 'Create state bundle').click();
      selectFormat('Data standardized into NMAM format');
      cy.get('#email-me').should('contain.text', 'After verification, your file will download instantly.');
      cy.contains('#email-me button', /^\s*Download\s*$/).should('be.visible');
      cy.contains('#email-me button', 'Email me the files').should('not.exist');
    });
  });

  it('state bundle with no matching files shows a no-data message instead of the dialog', function () {
    visitDataSets();
    cy.wait('@states').its('response.body.data').then((states: any[]) => {
      const st = states.filter((s) => !s.isUT).sort((a, b) => a.name.localeCompare(b.name))[0];
      selectMat('state', st.name);
      cy.wait('@datasets');
      selectYear('2025-26').then(({ response }) => {
        if (visibleRows(response.body.data).length) { cy.log('Data exists; not an empty case'); this.skip(); }
        cy.contains('button', 'Create state bundle').click();
        cy.contains('#email-me button', 'Email me the files').click();
        cy.contains('#email-me', 'No data available for the selected filter. Please select different option(s) to proceed with the download')
          .should('be.visible');
        cy.contains('#email-me button', 'Email me the files').should('be.disabled');
        cy.get('mat-dialog-container').should('not.exist');
      });
    });
  });

  it('ULB autocomplete searches ULBs and filters the datasets by the chosen ULB', function () {
    cy.intercept('POST', '**/api/v1/recentSearchKeyword/search?type=ulb*').as('ulbSearch');
    visitWithPre2019Rows().then((rows) => {
      if (!rows.length) this.skip();
      const ulbName = rows[0].ulbName as string;
      cy.get('input[formcontrolname="ulb"]').type(ulbName.slice(0, 6));
      cy.wait('@ulbSearch').then(({ request, response }) => {
        expect(request.body.matchingWord.ulb).to.eq(ulbName.slice(0, 6));
        expect(request.body.matchingWord.contentType).to.eq('Raw Data PDF');
        const names = response.body.data.map((u: any) => u.name);
        expect(names).to.include(ulbName);
        const ulb = response.body.data.find((u: any) => u.name === ulbName);
        cy.get('.mat-autocomplete-panel mat-option').should('have.length', names.length);
        cy.contains('.mat-autocomplete-panel mat-option', new RegExp(`^\\s*${ulbName}\\s*$`)).click();
        cy.wait('@datasets').then(({ request: r2, response: res2 }) => {
          expect(qs(r2.url).get('ulb')).to.eq(ulbName);
          expect(qs(r2.url).get('ulbId')).to.eq(ulb._id);
          visibleRows(res2.body.data).forEach((r: Row) => expect(r.ulbName).to.eq(ulbName));
          assertRowsMatch(res2.body.data);
        });
        cy.get('input[formcontrolname="ulb"]').should('have.value', ulbName);
      });
    });
  });

  it('ULB autocomplete offers nothing for an unknown name', () => {
    cy.intercept('POST', '**/api/v1/recentSearchKeyword/search?type=ulb*').as('ulbSearch');
    visitDataSets();
    cy.get('input[formcontrolname="ulb"]').type('zzqxj-no-such-ulb');
    cy.wait('@ulbSearch').its('response.body.data').should('have.length', 0);
    cy.get('.mat-autocomplete-panel mat-option').should('not.exist');
  });

  it('Clear All resets state, ULB, year and format and refetches', () => {
    visitDataSets().then(({ request: first }) => {
      const defaultYear = qs(first.url).get('year');
      selectYear(PRE_2019_YEAR);
      selectFormat('Budget data submitted by ULBs');
      cy.wait('@states').its('response.body.data').then((states: any[]) => {
        const st = states.filter((s) => !s.isUT).sort((a, b) => a.name.localeCompare(b.name))[0];
        selectMat('state', st.name);
        cy.wait('@datasets');
      });
      cy.get('button[title="Clear selection(s)"]').click();
      cy.wait('@datasets').then(({ request, response }) => {
        const q = qs(request.url);
        expect(q.get('year')).to.eq(defaultYear);
        expect(q.get('type')).to.eq('Raw Data PDF');
        expect(q.get('state')).to.eq('');
        expect(q.get('ulb')).to.eq('');
        cy.get('mat-select[formcontrolname="year"]').should('contain.text', defaultYear);
        cy.get('mat-select[formcontrolname="state"] .mat-select-placeholder, mat-select[formcontrolname="state"]')
          .first().should('not.contain.text', 'Andaman');
        cy.contains('mat-card', 'Data submitted by ULBs').find('mat-radio-button').should('have.class', 'mat-radio-checked');
        cy.get('mat-card.info-banner').should('not.exist');
        assertRowsMatch(response.body.data);
      });
    });
  });

  it('Budget PDF format requests "Budget PDF" files and lists them', () => {
    visitDataSets();
    selectFormat('Budget data submitted by ULBs').then(({ request, response }) => {
      expect(qs(request.url).get('type')).to.eq('Budget PDF');
      visibleRows(response.body.data).forEach((r: Row) => expect(r.section).to.eq('budgetPdf'));
      assertRowsMatch(response.body.data);
    });
  });

  it('Standardised Excel format lists excel rows; clicking one asks for user info (cancelled)', function () {
    cy.intercept('POST', '**/api/v1/annual-accounts/datasets').as('stdExcel');
    visitDataSets();
    selectFormat('Data standardized into NMAM format').then(({ request, response }) => {
      expect(qs(request.url).get('type')).to.eq('Standardised Excel');
      let rows = visibleRows(response.body.data);
      const check = (rs: Row[]) => {
        rs.forEach((r) => { expect(r.type).to.eq('excel'); expect(r.section).to.eq('standardised'); });
        assertRowsMatch(rs);
      };
      if (!rows.length) {
        // Default year has none — fall back to the most recent year that does.
        cy.log('No standardised files for the default year; trying 2022-23');
        selectYear('2022-23').then(({ response: r2 }) => {
          rows = visibleRows(r2.body.data);
          if (!rows.length) { cy.log('No standardised files on staging'); this.skip(); }
          check(rows);
        });
      } else check(rows);
      cy.get('.cd-repeat').first().find('.d-name').click();
      cy.get('mat-dialog-container app-user-info-dialog').should('be.visible');
      cy.contains('mat-dialog-container button', 'Cancel').click();
      cy.get('mat-dialog-container').should('not.exist');
      cy.get('@stdExcel.all').should('have.length', 0);
    });
  });

  it('Digitized Excel format calls the AFS digitization list and shows the OCR notice', () => {
    cy.intercept('GET', '**/api/v2/afs-digitization/afs-list*').as('afsList');
    visitDataSets().then(({ request }) => {
      const year = qs(request.url).get('year');
      cy.contains('mat-card', 'ULB submitted documents digitized').find('label').first().click();
      cy.wait('@afsList').then(({ request: r, response }) => {
        expect(qs(r.url).get('year')).to.eq(year);
        expect(qs(r.url).get('skip')).to.eq('0');
        cy.get('.ocr-alert').should('be.visible')
          .and('contain.text', 'These documents have been digitized using OCR and AI methods');
        assertRowsMatch(response.body.data);
      });
    });
  });

  it('clicking a 2019-20+ row opens the files dialog built from the ledger files API', function () {
    cy.intercept('GET', '**/api/v1/ledger/ulb-financial-data/files/**').as('ledgerFiles');
    visitDataSets();
    selectYear('2022-23').then(({ response }) => {
      const rows = visibleRows(response.body.data);
      if (!rows.length) { cy.log('No 2022-23 rows on staging'); this.skip(); }
      const row = rows[0];
      cy.get('.cd-repeat').first().find('.d-name').click();
      cy.wait('@ledgerFiles').then(({ request, response: res }) => {
        expect(request.url).to.contain(`/files/${row._id}`);
        expect(qs(request.url).get('financialYear')).to.eq('2022-23');
        expect(qs(request.url).get('auditType')).to.eq(row.auditType);
        const files = (res.body.data && res.body.data[row.type as string]) || [];
        cy.get('mat-dialog-container app-balance-tabledialog').should('be.visible').within(() => {
          if (files.length) {
            cy.contains('h5', (row.type as string).toUpperCase());
            cy.get('a.list-group-item').should('have.length', files.length);
            files.forEach((f: any, i: number) => cy.get('a.list-group-item').eq(i).should('contain.text', f.name));
            cy.contains(/Source: (Audited|Provisional) File\(s\) submitted by ULB/);
          } else {
            cy.contains('No Data Found for chosen options');
          }
        });
        if (files.length) {
          // Opening a file asks for user info first (cancelled -> nothing opens).
          cy.window().then((w) => cy.stub(w, 'open').as('winOpen'));
          cy.get('app-balance-tabledialog a.list-group-item').first().click();
          cy.get('app-user-info-dialog').should('be.visible');
          cy.contains('app-user-info-dialog button', 'Cancel').click();
          cy.get('app-user-info-dialog').should('not.exist');
          cy.get('@winOpen').should('not.have.been.called');
        }
        cy.get('body').type('{esc}');
        cy.get('mat-dialog-container').should('not.exist');
      });
    });
  });

  it('clicking a pre-2019 PDF row asks for user info and does not open the file when cancelled', function () {
    visitWithPre2019Rows().then((rows) => {
      if (!rows.length) this.skip();
      cy.window().then((w) => cy.stub(w, 'open').as('winOpen'));
      cy.get('.cd-repeat').first().find('.d-name').should('have.attr', 'mattooltip', 'Click to View').click();
      cy.get('app-user-info-dialog').should('be.visible');
      cy.contains('app-user-info-dialog button', 'Cancel').click();
      cy.get('@winOpen').should('not.have.been.called');
    });
  });

  it('row selection: Download appears, max 5 rows, master toggle selects/deselects', function () {
    visitWithPre2019Rows().then((rows) => {
      if (rows.length < 6) { cy.log('Need at least 6 rows'); this.skip(); }
      const rowBox = (i: number) => cy.get('.cd-repeat').eq(i).find('mat-checkbox');
      rowBox(0).find('label').click({ force: true }); // the 'Select to download' tooltip can overlap the next row
      rowBox(0).should('have.class', 'mat-checkbox-checked');
      cy.get('button[title="Download reports"]').should('be.visible');
      // Ticking a checkbox must not trigger the row's "view" click.
      cy.get('mat-dialog-container').should('not.exist');
      rowBox(0).find('label').click({ force: true }); // the 'Select to download' tooltip can overlap the next row
      rowBox(0).should('not.have.class', 'mat-checkbox-checked');
      cy.get('button[title="Download reports"]').should('not.exist');

      for (let i = 0; i < 5; i++) rowBox(i).find('label').click({ force: true }); // the 'Select to download' tooltip can overlap the next row
      cy.get('.cd-repeat mat-checkbox.mat-checkbox-checked').should('have.length', 5);
      for (let i = 5; i < rows.length; i++) rowBox(i).should('have.class', 'mat-checkbox-disabled');
      rowBox(4).find('label').click({ force: true }); // the 'Select to download' tooltip can overlap the next row
      rowBox(5).should('not.have.class', 'mat-checkbox-disabled');

      // Master toggle: off -> clears everything.
      cy.get('.cd-h mat-checkbox label').click({ force: true }); // -> checked: fills up to 5
      cy.get('.cd-repeat mat-checkbox.mat-checkbox-checked').should('have.length', 5);
      cy.get('.cd-repeat mat-checkbox.mat-checkbox-disabled').should('have.length', rows.length - 5);
      cy.get('.cd-h mat-checkbox label').click({ force: true }); // -> unchecked
      cy.get('.cd-repeat mat-checkbox.mat-checkbox-checked').should('have.length', 0);
      cy.get('.cd-repeat mat-checkbox.mat-checkbox-disabled').should('have.length', 0);
      cy.get('button[title="Download reports"]').should('not.exist');
    });
  });

  it('Download dialog validates the user-info form and Cancel sends nothing', function () {
    cy.intercept('POST', '**/api/v1/file-download-log/userInfo').as('logPost');
    cy.intercept('POST', '**/api/v1/**/sendOtp*').as('otp');
    visitWithPre2019Rows().then((rows) => {
      if (rows.length < 2) this.skip();
      cy.get('.cd-repeat').eq(0).find('mat-checkbox label').click({ force: true });
      cy.get('.cd-repeat').eq(1).find('mat-checkbox label').click({ force: true });
      cy.get('button[title="Download reports"]').click();
      cy.wait('@userInfoQuestions').its('response.body.data').then((cfg: any) => {
        cy.get('app-user-info-dialog').within(() => {
          cy.contains('h2', cfg.title || 'Download');
          cy.contains('Your personal information is safe.');
          cfg.data.forEach((f: any) => cy.contains('mat-label', f.label).should('exist'));
          cy.get('input[matinput]').should('have.length', cfg.data.length);
          cy.contains('button', 'Submit').should('be.disabled');
          if (cfg.checkboxMsg) cy.get('#checkbox').should('not.be.checked');

          const nameF = cfg.data.find((f: any) => f.key === 'userName');
          const emailF = cfg.data.find((f: any) => f.key === 'email');
          if (nameF) {
            cy.get('#userName').type('ab').blur();
            cy.contains('mat-error', 'Must be at least 3 characters.').should('be.visible');
            cy.get('#userName').clear().blur();
            cy.contains('mat-error', 'This field is required.').should('be.visible');
          }
          if (emailF) {
            cy.get('#email').type('not-an-email').blur();
            cy.contains('mat-error', 'Invalid email address').should('be.visible');
          }
          cy.contains('button', 'Submit').should('be.disabled');
          cy.contains('button', 'Cancel').click();
        });
      });
      cy.get('app-user-info-dialog').should('not.exist');
      cy.get('@logPost.all').should('have.length', 0);
      cy.get('@otp.all').should('have.length', 0);
      // Selection is kept after cancelling.
      cy.get('.cd-repeat mat-checkbox.mat-checkbox-checked').should('have.length', 2);
    });
  });

  it('Download (pre-2019) fetches every selected file — download log POST stubbed', function () {
    // A previously verified visitor: the app skips the dialog and only POSTs a
    // download-log entry, which is stubbed here so nothing reaches staging.
    cy.intercept('POST', '**/api/v1/file-download-log/userInfo', { statusCode: 200, body: { success: true } }).as('logPost');
    // Real request/response; only the body is trimmed so the browser doesn't hold large PDFs.
    cy.intercept('GET', '**/api/v2/file/download?signature=*', (req) => {
      req.continue((res) => { res.body = '%PDF-1.4 trimmed'; });
    }).as('fileDl');
    visitWithPre2019Rows().then((rows) => {
      if (rows.length < 2) this.skip();
      cy.window().then((w) => w.localStorage.setItem('userInfo', JSON.stringify({
        userName: 'Cypress', email: 'cypress@example.invalid', organization: 'QA', designation: 'QA', isEmailVerified: true,
      })));
      cy.get('.cd-repeat').eq(0).find('mat-checkbox label').click({ force: true });
      cy.get('.cd-repeat').eq(1).find('mat-checkbox label').click({ force: true });
      cy.get('button[title="Download reports"]').click();
      cy.wait('@logPost').its('request.body').then((body: any) => {
        expect(body.module).to.eq('resources');
        expect(body.fileDownloaded.map((f: any) => f.fileName)).to.deep.eq([
          `${rows[0].fileName}_Raw Data PDF`, `${rows[1].fileName}_Raw Data PDF`,
        ]);
      });
      cy.get('app-user-info-dialog').should('not.exist');
      cy.wait(['@fileDl', '@fileDl'], { timeout: 60000 }).then((calls) => {
        const urls = calls.map((c) => c.request.url);
        expect(urls).to.have.members([rows[0].fileUrl, rows[1].fileUrl]);
        calls.forEach((c) => {
          expect(c.response!.statusCode).to.eq(200);
          expect(c.response!.headers['content-type']).to.contain('application/pdf');
        });
      });
      cy.contains('.swal-title, .swal2-title', 'File Downloaded', { timeout: 60000 }).should('be.visible');
      cy.get('.cd-repeat mat-checkbox.mat-checkbox-checked').should('have.length', 0);
    });
  });

  it('Download (2019-20+) zips the ledger files of the selected row — log + file bodies stubbed', function () {
    cy.intercept('POST', '**/api/v1/file-download-log/userInfo', { statusCode: 200, body: { success: true } }).as('logPost');
    cy.intercept('GET', '**/api/v1/ledger/ulb-financial-data/files/**').as('ledgerFiles');
    // Keep the zip small: stub the individual file bodies.
    cy.intercept('GET', /\/api\/v1\/file\/download\?signature=|amazonaws\.com\//, { statusCode: 200, body: '%PDF-1.4 stub' }).as('zipPart');
    visitDataSets();
    selectYear('2022-23').then(({ response }) => {
      const rows = visibleRows(response.body.data);
      if (!rows.length) this.skip();
      cy.window().then((w) => w.localStorage.setItem('userInfo', JSON.stringify({
        userName: 'Cypress', email: 'cypress@example.invalid', organization: 'QA', designation: 'QA', isEmailVerified: true,
      })));
      cy.get('.cd-repeat').eq(0).find('mat-checkbox label').click({ force: true });
      cy.get('button[title="Download reports"]').click();
      cy.wait('@logPost').its('request.body.fileDownloaded.0.fileName')
        .should('eq', `${rows[0].fileName}.zip_Raw Data PDF`);
      cy.wait('@ledgerFiles').then(({ request, response: res }) => {
        expect(request.url).to.contain(`/files/${rows[0]._id}`);
        const files = res!.body.data[rows[0].type as string] || [];
        if (!files.length) { cy.log('Ledger has no files for this row'); return; }
        cy.wait(Array(files.length).fill('@zipPart'));
        cy.contains('snack-bar-component', 'All set! Your file(s) have been successfully downloaded.').should('be.visible');
      });
    });
  });

  it('at phone width the filter buttons collapse to icons and rows still render', () => {
    cy.viewport(375, 812);
    visitDataSets();
    selectYear(PRE_2019_YEAR).then(({ response }) => {
      cy.get('button[title="Clear selection(s)"]').within(() => {
        cy.contains('span', 'Clear All').should('not.be.visible');
        cy.contains('mat-icon', 'highlight_off').should('be.visible');
      });
      assertRowsMatch(response.body.data);
    });
  });
});
