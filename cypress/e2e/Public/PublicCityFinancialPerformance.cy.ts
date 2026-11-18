/**
 * Public (logged-out) City Dashboard — Financial Performance tab.
 * URL: /municipal-data/city/:slug  (staging city: pune)
 *
 * Built from the cf-ui-ssr-v3 `staging` branch (src/app/pages/dashboard/city/**,
 * dashboard-service.ts, shared/components/**) and cf-nest-api-v2 response
 * shapes; checked against staging. Read-only: the only POSTs are the page's
 * ULB search lookups. Expected values come from intercepted API responses
 * (or cy.request where the page hydrates from SSR TransferState and makes no
 * browser call); only static UI text is hard-coded.
 *
 * Covers: years + tree table vs getCityDasboardIndicators, chart title/selection,
 * expand/collapse, info popup, Overview/Revenue/Expenditure/Debt sub-tabs and
 * their warnings, year selector, FAQs (+ Resources link), XLSX and PNG
 * downloads, "Compare with different cities".
 */
import {
  API, SLUG, SAME_STATE_CITY, EMPTY_SLUG, inr, norm, stripHtml, threeYears, snackbar, cityDetails,
  interceptCommon, visitCity, tab, openTab, treeNode, fpCellText, assertTree, chartTitle, chartTitleIs, expectedWarning,
} from './cityDashboardHelpers';

export {}; // Own module scope so top-level names don't collide across specs.

describe('Public | City dashboard — Financial Performance tab', () => {
  it('loads years and the Overview tree from the API; values, growth, intro and source match', () => {
    visitCity();
    cy.wait('@yearsDynamic').then(({ response: yr }) => {
      const years: string[] = yr!.body.years;
      cy.get('app-financial-performance select#years option').then(($o) => {
        expect([...$o].map((o) => (o as HTMLOptionElement).value)).to.deep.eq(years);
      });
      cy.get('app-financial-performance select#years').should('have.value', years[0]);
      cy.wait('@indicators').then(({ request, response }) => {
        const u = decodeURIComponent(request.url);
        expect(u).to.contain('keyType=overview');
        threeYears(years[0]).forEach((y) => expect(u).to.contain(`years[]=${y}`));
        const res = response!.body;
        cy.contains('app-financial-performance p.fw-bold', "Pune Municipal Corporation's key ratios").should('be.visible');
        cy.contains('app-financial-performance p', norm(res.response.intro)).should('exist');
        cy.contains('app-financial-performance span.custom-font-size-5', res.source).should('exist');
        cy.contains('app-tab-buttons button.btn-cfPrimary', 'Overview').should('exist');
        // App auto-selects data[1] and expands it.
        const selected = res.response.data[1];
        chartTitleIs(selected.name);
        assertTree(res.response.data, selected);
        treeNode(selected.name).should('have.class', 'selected');
        cy.get('app-financial-performance app-charts canvas').should('exist');
      });
    });
  });

  it('clicking a parent row switches the chart and expands it; clicking again collapses it', () => {
    visitCity();
    cy.wait(['@indicators', '@indicators']).its('1.response.body.response.data').then((data: any[]) => {
      const target = data.slice(2).find((n) => n.isParent && n.children?.length);
      if (!target) { cy.log('No second expandable row'); return; }
      const first = data[1];
      treeNode(target.name).click();
      chartTitleIs(target.name);
      target.children.forEach((c: any) => treeNode(c.name).should('be.visible'));
      (first.children || []).forEach((c: any) => treeNode(c.name).should('not.exist'));
      treeNode(target.name).should('have.class', 'selected');
      treeNode(target.name).click();
      target.children.forEach((c: any) => treeNode(c.name).should('not.exist'));
    });
  });

  it('clicking a leaf indicator row updates the chart title; header row is not clickable', () => {
    visitCity();
    cy.wait(['@indicators', '@indicators']).its('1.response.body.response.data').then((data: any[]) => {
      const leaf = data.find((n) => n.isParent && !n.children?.length);
      if (!leaf) { cy.log('No leaf indicator'); return; }
      treeNode(leaf.name).click();
      chartTitleIs(leaf.name);
      treeNode(data[0].name).should('have.class', 'no-pointer');
    });
  });

  it('info icon opens the Information popup with the indicator explanation; Close dismisses it', () => {
    visitCity();
    cy.wait(['@indicators', '@indicators']).its('1.response.body.response.data').then((data: any[]) => {
      const sel = data[1];
      chartTitleIs(sel.name);
      cy.get('app-financial-performance #chartContainer i.bi-info-circle-fill').should('have.attr', 'aria-label', 'Click to view').click();
      // Known staging bug: one click opens the popup twice (stacked dialogs).
      // Assert the content of every copy and close them all.
      cy.get('mat-dialog-container').should('have.length.at.least', 1).then(($d) => {
        cy.log(`Information dialogs opened by one click: ${$d.length}`);
        const words = stripHtml(sel.info || 'N/A').slice(0, 40);
        [...$d].forEach((d) => {
          expect(norm(d.querySelector('h2')?.textContent || '')).to.eq('Information');
          expect(norm(d.querySelector('.popup-content')?.textContent || '')).to.contain(words);
        });
      });
      // The duplicate can open after the count above, so close until none is left.
      const closeAll = (left = 5) => {
        cy.get('body').then(($b) => {
          const open = $b.find('mat-dialog-container').length;
          if (!open) return;
          if (left <= 0) throw new Error('Information popups never all closed');
          cy.get('mat-dialog-container').last().contains('button', 'Close').click();
          cy.get('body').should(($after) => expect($after.find('mat-dialog-container').length).to.be.lessThan(open));
          closeAll(left - 1);
        });
      };
      closeAll();
      cy.get('mat-dialog-container').should('not.exist');
    });
  });

  (['revenue', 'expenditure', 'debt'] as const).forEach((key) => {
    const label = { revenue: 'Revenue', expenditure: 'Expenditure', debt: 'Debt and Assets' }[key];
    const title = { revenue: 'revenue overview', expenditure: 'expenditure breakdown', debt: 'debt and assets' }[key];
    it(`"${label}" sub-tab fetches keyType=${key}, renders its tree and the correct warning`, () => {
      visitCity();
      cy.wait('@yearsDynamic').its('response.body.years').then((years: string[]) => {
      cy.wait(`@ind_overview_${years[0]}`);
      cy.contains('app-financial-performance app-tab-buttons button', label).click();
      cy.contains('app-financial-performance app-tab-buttons button', label).should('have.class', 'btn-cfPrimary');
      cy.contains('app-financial-performance app-tab-buttons button', 'Overview').should('have.class', 'unselected-btn');
      cy.wait(`@ind_${key}_${years[0]}`).then(({ request, response }) => {
        expect(request.url).to.contain(`keyType=${key}`);
        const res = response!.body;
        cy.contains('app-financial-performance p.fw-bold', `Pune Municipal Corporation's ${title}`).should('be.visible');
        chartTitleIs(res.response.data[1].name);
        assertTree(res.response.data, res.response.data[1]);
        const warn = expectedWarning(key, res, 'Pune Municipal Corporation');
        if (warn) cy.contains('app-financial-performance .alert-info', warn).should('be.visible');
        else cy.get('app-financial-performance .alert-info').should('not.exist');
      });
      });
    });
  });

  it('changing Financial Year refetches indicators for the 3-year window and the FAQs', () => {
    visitCity();
    cy.wait('@yearsDynamic').its('response.body.years').then((years: string[]) => {
      cy.wait(`@ind_overview_${years[0]}`);
      cy.wait('@faqs');
      const y = years[1];
      cy.get('app-financial-performance select#years').select(y);
      cy.wait(`@ind_overview_${y}`).then(({ request, response }) => {
        const u = decodeURIComponent(request.url);
        threeYears(y).forEach((yy) => expect(u).to.contain(`years[]=${yy}`));
        const header = response!.body.response.data[0];
        treeNode(header.name).find('.px-2 > .d-flex > div').should(($c) => {
          expect([...$c].map((c) => norm(c.textContent || ''))).to.deep.eq(header.yearData);
        });
      });
      cy.wait('@faqs').its('request.url').should('contain', `year=${y}`).and('contain', 'state=Maharashtra')
        .and('contain', 'populationType=cat1');
    });
  });

  it('FAQs come from the API and expand/collapse on click', () => {
    visitCity();
    cy.wait('@faqs').its('response.body.faqs').then((faqs: any[]) => {
      if (!faqs?.length) { cy.log('No FAQs on staging'); return; }
      cy.contains('h2', 'Frequently Asked Questions').should('exist');
      cy.get('app-financial-performance .faq-item').should('have.length', faqs.length);
      faqs.forEach((f, i) => cy.get('.faq-item').eq(i).find('h3').should('have.text', f.question));
      cy.get('.faq-item').eq(0).find('.faq-answer').should('have.css', 'max-height', '0px');
      cy.get('.faq-item').eq(0).find('.faq-question').click();
      cy.get('.faq-item').eq(0).find('.faq-answer').should('have.css', 'max-height', '400px')
        .and(($a) => expect(norm($a.text())).to.contain(norm(faqs[0].answer).split(/\bNote\s*:/i)[0].trim().slice(0, 40)));
      cy.get('.faq-item').eq(0).find('i.faq-icon').should('have.class', 'bi-x');
      cy.get('.faq-item').eq(0).find('.faq-question').click();
      cy.get('.faq-item').eq(0).find('.faq-answer').should('have.css', 'max-height', '0px');
      cy.get('.faq-item').eq(0).find('i.faq-icon').should('have.class', 'bi-plus');
    });
  });

  it('FAQ "Resources" link goes to the v1 income-statement data-sets page', () => {
    visitCity();
    cy.wait('@faqs').its('response.body.faqs').then((faqs: any[]) => {
      const idx = (faqs || []).findIndex((f) => /\bResources\b/.test(f.answer));
      if (idx < 0) { cy.log('No FAQ mentions Resources'); return; }
      cy.get('.faq-item').eq(idx).find('.faq-question').click();
      // The v1 Angular app loaded here is out of scope; ignore only its own load errors.
      cy.on('uncaught:exception', () => false);
      cy.get('.faq-item').eq(idx).contains('button.faq-resource-btn', 'Resources').click();
      cy.location('pathname', { timeout: 20000 }).should('eq', '/v1/resources-dashboard/data-sets/income_statement');
    });
  });

  it('"Download as XLSX" requests the market-dashboard Excel for the latest year', () => {
    cy.intercept('GET', '**/api/v1/ledger/downloadMarketDashboardExcel*').as('xlsx');
    visitCity();
    cy.wait('@yearsDynamic').its('response.body.years').then((years: string[]) => {
      cy.wait('@indicators');
      cy.contains('app-financial-performance button', 'Download as XLSX').click();
      cy.wait('@xlsx').then(({ request, response }) => {
        expect(request.url).to.contain('ulbId=5eb5844f76a3b61f40ba0694').and.contain(`year=${years[0]}`);
        expect(response!.statusCode).to.eq(200);
        expect(response!.headers['content-type']).to.contain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      });
    });
  });

  it('"Download as PNG" captures the chart and saves "<chart title>.png"', () => {
    visitCity();
    cy.wait(['@indicators', '@indicators']).its('1.response.body.response.data').then((data: any[]) => {
      chartTitleIs(data[1].name);
      cy.window().then((win) => {
        cy.stub(win.HTMLAnchorElement.prototype, 'click').as('anchorClick');
      });
      cy.contains('app-financial-performance button', 'Download as PNG').click();
      cy.get('@anchorClick', { timeout: 20000 }).should('have.been.calledOnce').then((stub: any) => {
        const a = stub.getCall(0).thisValue as HTMLAnchorElement;
        expect(a.download).to.eq(`${data[1].name}.png`);
        expect(a.href).to.match(/^data:image\/png;base64,/);
      });
      // The temporary watermark is removed again.
      cy.get('#chartContainer .cfLogo').should('not.exist');
    });
  });

  it('"Compare with different cities" opens the compare page with ?cities=<slug>', () => {
    visitCity();
    cy.wait('@indicators');
    // The compare page (separate spec) fires a 400 for a single city; ignore only that.
    cy.on('uncaught:exception', (e) => !/getCompareByIndicators.*400/.test(e.message));
    cy.contains('p', 'Compare Pune Municipal Corporation with different cities').should('be.visible');
    cy.get('#compare-with-cities').click();
    cy.location('pathname').should('eq', '/municipal-data/city/comparewith');
    cy.location('search').should('eq', `?cities=${SLUG}`);
  });
});
