/**
 * Public (logged-out) Resources → Learning Center.
 * URLs: /v1/resources-dashboard/learning-center/{toolkits[/introduction|score-performance|
 *       enumeration|valuation|assessment|billingCollection|reporting], bestPractices,
 *       eLearning, municipal-laws, faqs, municipal-bond-repository}
 *
 * Built from the cityfinance-ng-ui `staging` branch (old Angular 14 app, served
 * under /v1): pages/resources-dashboard/learning-center/* , the shared
 * filter-component and municipal-law/municipal-laws — and checked against staging.
 *
 * Data-driven expectations come from intercepted API responses
 * (resourceDashboard/?..., main_category/list, municipalBondRepository/list,
 * link-record, scorePerformance, ...). Read-only: the score-performance
 * questionnaire is never submitted and the municipal-law download dialog is
 * cancelled. External links (World Bank, S3 PDFs) are asserted by href/target
 * or by stubbing window.open, never followed.
 */
export {};

const LC = '/v1/resources-dashboard/learning-center';
const RE_PDF_LIST = /\/api\/v1\/resourceDashboard\/\?toolKitVisible=/;
const STORAGE = 'https://jana-cityfinance-stg.s3.ap-south-1.amazonaws.com';
const toStorageUrl = (v?: string) => (!v ? '' : /^https?:\/\//i.test(v) ? v : STORAGE + v);
const qs = (url: string) => new URL(url).searchParams;

const LC_TABS = [
  ['Toolkits', 'toolkits'],
  ['Best Practices', 'bestPractices'],
  ['E-Learning Modules', 'eLearning'],
  ['Municipal Laws', 'municipal-laws'],
  ['Glossary', 'faqs'],
  ['Municipal Bond Repository', 'municipal-bond-repository'],
];

const TOOLKIT_TABS = [
  ['Introduction', 'introduction'],
  ['Score Your Performance', 'score-performance'],
  ['Enumeration', 'enumeration'],
  ['Valuation', 'valuation'],
  ['Assessment', 'assessment'],
  ['Billing and Collection', 'billingCollection'],
  ['Reporting', 'reporting'],
];

/** Toolkit chapters: first + second "Key Recommendations" card, and best-practice key (null = section has none). */
const CHAPTERS: { link: string; first: string; second: string; bp: string | null }[] = [
  { link: 'enumeration', first: 'Creation of a GIS based property tax register', second: 'Periodically updating property tax register', bp: 'enumeration' },
  { link: 'valuation', first: 'Adopt capital valuation system', second: 'Institute mechanism for periodic rate revision', bp: null },
  { link: 'assessment', first: 'Adoption of Online Self-Assessment System', second: 'Rule-based Exemptions & Disclosure of Revenue Foregone', bp: 'assessment' },
  { link: 'billingCollection', first: 'Digital billing and online system for collection', second: 'Technological Interventions', bp: 'billing_and_Collection' },
  { link: 'reporting', first: 'Creation of a MIS System for performance tracking', second: 'Ranking of Revenue Officials', bp: 'reporting' },
];

/**
 * Opens a toolkit chapter the way a user does (Introduction -> chapter tab).
 * Deep-linking straight to a chapter URL renders the Introduction instead — see
 * the KNOWN BUG test.
 */
function openChapter(link: string) {
  cy.visit(`${LC}/toolkits/introduction`);
  cy.get(`app-toolkits ul.nav-pills a.nav-link[href$="/toolkits/${link}"]`).click();
  cy.location('pathname').should('eq', `${LC}/toolkits/${link}`);
}

/**
 * The PDF thumbnails (pdf-viewer) download every repository/best-practice PDF,
 * which makes these pages very slow and memory-hungry under Cypress. Serve a
 * one-page placeholder PDF for the thumbnail fetches; hrefs are still asserted
 * against the real URLs from the API.
 */
const TINY_PDF = [
  '%PDF-1.1',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj',
  'trailer<</Root 1 0 R>>',
  '%%EOF',
].join('\n');
function stubPdfThumbnails() {
  cy.intercept('GET', /\/api\/v1\/(resourceDashboard|municipalBondRepository)\/download\//, {
    statusCode: 200, headers: { 'content-type': 'application/pdf' }, body: TINY_PDF,
  }).as('pdfThumb');
}

const lcTab = (name: string) => cy.contains('ul.resources-tab a.nav-link', new RegExp(`^\\s*${name}\\s*$`));

describe('Public | Resources — Learning Center shell', () => {
  it('shows the learning-center tabs with correct links; E-Learning tab is hidden by CSS', () => {
    cy.visit(`${LC}/toolkits`);
    cy.get('ul.resources-tab li').should('have.length', LC_TABS.length);
    LC_TABS.forEach(([name, link]) => {
      lcTab(name).should('have.attr', 'href', `${LC}/${link}`);
    });
    // nth-child(3) is display:none in resources-tabs.component.scss
    cy.get('ul.resources-tab li').eq(2).should('not.be.visible');
    lcTab('Toolkits').should('have.class', 'active');
    cy.contains('.res-card', 'Learning Center').should('have.class', 'activeCard');
  });

  it('navigates between tabs and moves the active state', () => {
    cy.visit(`${LC}/toolkits`);
    LC_TABS.filter(([, l]) => l !== 'eLearning').forEach(([name, link]) => {
      lcTab(name).click();
      cy.location('pathname').should('eq', `${LC}/${link}`);
      lcTab(name).should('have.class', 'active');
      LC_TABS.filter(([n]) => n !== name).forEach(([n]) => lcTab(n).should('not.have.class', 'active'));
    });
  });
});

describe('Public | Resources — Toolkits', () => {
  it('lists the toolkit cards', () => {
    cy.visit(`${LC}/toolkits`);
    cy.get('app-toolkits .card').should('have.length', 2);
    cy.contains('app-toolkits .card', 'Digital Property Tax Toolkit').find('img').should('have.attr', 'alt', 'Digital Property Tax Toolkit');
    cy.contains('app-toolkits .card', 'Credit Rating Toolkit').find('img').should('have.attr', 'alt', 'Credit Rating Toolkit');
    cy.get('app-toolkits ul.nav-pills').should('not.exist');
  });

  it('Credit Rating Toolkit opens its PDF in a new window (stubbed)', () => {
    cy.visit(`${LC}/toolkits`, { onBeforeLoad: (w) => cy.stub(w, 'open').as('winOpen') });
    cy.contains('app-toolkits .card', 'Credit Rating Toolkit').click();
    cy.get('@winOpen').should('have.been.calledOnce')
      .its('firstCall.args.0').should('match', /^https:\/\/.*Credit_Rating_Toolkit.*\.pdf$/);
    cy.location('pathname').should('eq', `${LC}/toolkits`);
  });

  it('Digital Property Tax Toolkit opens the introduction with chapter tabs', () => {
    cy.visit(`${LC}/toolkits`);
    cy.contains('app-toolkits .card', 'Digital Property Tax Toolkit').click();
    cy.location('pathname').should('eq', `${LC}/toolkits/introduction`);
    cy.contains('app-toolkits .heading', 'Property Tax Toolkit').should('be.visible');
    cy.contains('app-toolkits p', 'Supported by the')
      .find('a').should('have.attr', 'href', 'https://www.worldbank.org/en/programs/the-global-tax-program')
      .and('have.attr', 'target', '_blank').and('contain.text', 'Global Tax Program');
    cy.get('app-toolkits ul.nav-pills a.nav-link').should('have.length', TOOLKIT_TABS.length).each(($a, i) => {
      expect($a.text().trim()).to.eq(TOOLKIT_TABS[i][0]);
      expect($a.attr('href')).to.eq(`${LC}/toolkits/${TOOLKIT_TABS[i][1]}`);
    });
    cy.contains('app-toolkits ul.nav-pills a.nav-link', 'Introduction').should('have.class', 'active');
    cy.contains('.sub-h', 'What is the Property Tax Digital Toolkit?').should('be.visible');
    cy.contains('.sub-ans', 'one-stop-shop for all your needs for reforming property taxes').should('be.visible');
    cy.get('img[src*="introImg.png"]').should('be.visible');
  });

  it('switches toolkit chapters via the tabs and the "Property Tax Toolkit" heading returns to Introduction', () => {
    cy.visit(`${LC}/toolkits/introduction`);
    TOOLKIT_TABS.slice(1).forEach(([name, link]) => {
      cy.contains('app-toolkits ul.nav-pills a.nav-link', name).click();
      cy.location('pathname').should('eq', `${LC}/toolkits/${link}`);
      cy.contains('app-toolkits ul.nav-pills a.nav-link', name).should('have.class', 'active');
    });
    cy.contains('app-toolkits a.h-a', 'Property Tax Toolkit').click();
    cy.location('pathname').should('eq', `${LC}/toolkits/introduction`);
    cy.contains('.sub-h', 'What is the Property Tax Digital Toolkit?').should('be.visible');
  });

  it('the Toolkits tab brings back the toolkit cards from a chapter', () => {
    cy.visit(`${LC}/toolkits/valuation`);
    cy.get('app-toolkits ul.nav-pills').should('be.visible');
    lcTab('Toolkits').click();
    cy.location('pathname').should('eq', `${LC}/toolkits`);
    cy.contains('app-toolkits .card', 'Digital Property Tax Toolkit').should('be.visible');
  });

  CHAPTERS.forEach((ch) => {
    it(`${ch.link}: current practices, key-recommendation cards switch content, best practices from the API`, () => {
      cy.intercept('GET', RE_PDF_LIST).as('bp');
      stubPdfThumbnails();
      openChapter(ch.link);
      cy.contains('app-dynamic-sub-learning .heading', 'Current Practices').should('be.visible');
      cy.contains('app-dynamic-sub-learning .heading', 'Key Recommendations').should('be.visible');
      cy.get('app-dynamic-sub-learning .responsiveCards .card').as('cards');
      cy.get('@cards').first().should('contain.text', ch.first).and('have.class', 'cardSuper');
      cy.get('@cards').eq(1).should('contain.text', ch.second).and('not.have.class', 'cardSuper');
      cy.get('app-dynamic-sub-learning .sub-ans.just, app-dynamic-sub-learning .just').then(($before) => {
        const before = $before.text();
        cy.get('@cards').eq(1).click();
        cy.get('@cards').eq(1).should('have.class', 'cardSuper');
        cy.get('@cards').first().should('not.have.class', 'cardSuper');
        cy.get('app-dynamic-sub-learning .sub-ans.just, app-dynamic-sub-learning .just')
          .should(($after) => expect($after.text()).not.to.eq(before));
      });
      // Image carousel for the selected recommendation.
      cy.get('app-dynamic-sub-learning ngx-slick-carousel').should('exist');

      if (!ch.bp) {
        cy.contains('app-dynamic-sub-learning .heading', 'Best Practices').should('not.exist');
        return;
      }
      cy.wait('@bp').then(({ request, response }) => {
        const q = qs(request.url);
        expect(q.get('toolKitVisible')).to.eq(ch.bp);
        expect(q.get('subHeader')).to.eq('best_practices');
        expect(q.get('header')).to.eq('learning_center');
        const data = response!.body.data || [];
        cy.contains('app-dynamic-sub-learning .heading', 'Best Practices').should('be.visible');
        if (!data.length) {
          cy.contains('app-dynamic-sub-learning p', 'No Best Practices Found').should('be.visible');
          return;
        }
        cy.get('app-dynamic-sub-learning .practiceCard').should('have.length', data.length);
        data.forEach((d: any, i: number) => {
          // Single retryable assertion: the carousel re-inits (and the list re-renders) when a card is switched.
          cy.get('app-dynamic-sub-learning .practiceCard').eq(i).should(($c) => {
            const a = $c.find('a');
            expect(a.attr('href')).to.eq(d.downloadUrl);
            expect(a.attr('target')).to.eq('_blank');
            const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
            expect(norm($c.find('.docs').text())).to.eq(norm(String(d.name)));
          });
        });
      });
    });
  });

  it('KNOWN BUG: deep-linking to a chapter URL shows the Introduction content', () => {
    cy.visit(`${LC}/toolkits/enumeration`);
    cy.contains('app-toolkits ul.nav-pills a.nav-link', 'Enumeration').should('have.class', 'active');
    // DynamicSubLearningComponent only reacts to NavigationEnd events emitted
    // after it is constructed, so the first (deep-link) navigation is missed.
    cy.contains('.sub-h', 'What is the Property Tax Digital Toolkit?').should('be.visible');
    cy.contains('app-dynamic-sub-learning .heading', 'Current Practices').should('not.exist');
  });

  it('chapter carousel arrows/dots move between slides', function () {
    openChapter('billingCollection');
    // "Technological Interventions" has 4 slides.
    cy.contains('app-dynamic-sub-learning .responsiveCards .card', 'Technological Interventions').click();
    cy.get('app-dynamic-sub-learning .slick-dots li').should('have.length', 4);
    // Let slick finish its slide animation (clicks during a transition are ignored).
    const settled = () => {
      let last = NaN;
      cy.get('app-dynamic-sub-learning .slick-track').should(($t) => {
        const l = Math.round($t[0].getBoundingClientRect().left);
        const stable = l === last;
        last = l;
        expect(stable, 'carousel settled').to.eq(true);
      });
    };
    const current = () => cy.get('app-dynamic-sub-learning .slick-slide.slick-current');
    current().should('contain.text', 'Step One: Creation of a single digital property register');
    cy.get('app-dynamic-sub-learning .slick-next').click();
    cy.wait(600); // slick ignores clicks while animating (speed 300ms)
    current().should('contain.text', 'Step Two: Integrated or Unified Billing');
    settled();
    cy.get('app-dynamic-sub-learning .slick-dots li').eq(3).find('button').click();
    cy.wait(600);
    current().should('contain.text', 'Step Four: De-linking the functions');
    settled();
    cy.get('app-dynamic-sub-learning .slick-dots li').eq(3).should('have.class', 'slick-active');
    cy.wait(600);
    cy.get('app-dynamic-sub-learning .slick-prev').should('be.visible').click();
    current().should('contain.text', 'Step Three: Increase channels and modes of payments');
  });
});

describe('Public | Resources — Toolkit "Score Your Performance"', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/v1/scorePerformance').as('questions');
    cy.intercept('GET', /\/api\/v1\/+state$/).as('states');
    cy.intercept('GET', /\/states\/[A-Z]+\/ulbs/).as('ulbs');
    cy.intercept('GET', '**/api/v1/scorePerformanceByUlb/**').as('report');
    cy.intercept('POST', '**/api/v1/scorePerformanceQuestionAnswer').as('submitScore');
    cy.visit(`${LC}/toolkits/score-performance`);
    cy.wait('@questions');
  });

  afterEach(() => {
    cy.get('@submitScore.all').should('have.length', 0);
  });

  it('shows the intro, a disabled ULB select and a disabled Get Started button', () => {
    cy.contains('h3', 'Assess the health of your property tax system in 5 easy steps').should('be.visible');
    cy.contains('app-score-per p', 'Select the state and ULB from the dropdown menu').should('be.visible');
    cy.get('app-score-per select.form-select').should('be.disabled');
    cy.contains('app-score-per button', 'Get Started').should('be.disabled');
  });

  it('state dropdown lists API states, searches, loads ULBs and Get Started opens the score flow', () => {
    cy.wait('@states').its('response.body.data').then((states: any[]) => {
      cy.get('app-score-per angular2-multiselect .c-btn').click();
      cy.get('.dropdown-list:visible li.pure-checkbox').should('have.length', states.length);
      // Search inside the dropdown — negative and positive.
      cy.get('.dropdown-list:visible input.c-input').type('zzqx');
      cy.get('.dropdown-list:visible li.pure-checkbox:visible').should('have.length', 0);
      const target = states.find((s) => s.code === 'CG') || states[0];
      cy.get('.dropdown-list:visible input.c-input').clear().type(target.name);
      cy.contains('.dropdown-list:visible li.pure-checkbox:visible', target.name).click();
      cy.wait('@ulbs').then(({ request, response }) => {
        expect(request.url).to.contain(`/states/${target.code}/ulbs`);
        const ulbs = [...response!.body.data.ulbs].sort((a: any, b: any) => a.name.localeCompare(b.name));
        cy.get('app-score-per select.form-select').should('not.be.disabled')
          .find('option').should('have.length', ulbs.length + 1);
        cy.get('app-score-per select.form-select option').eq(1).invoke('text')
          .should((t) => expect(t.trim()).to.eq(ulbs[0].name.trim()));
        cy.get('app-score-per select.form-select').select(ulbs[0]._id);
        cy.contains('app-score-per button', 'Get Started').should('not.be.disabled').click();
        cy.wait('@report').then(({ request: r, response: rep }) => {
          expect(r.url).to.contain(`/scorePerformanceByUlb/${ulbs[0]._id}`);
          if (rep!.body.data) {
            cy.contains('app-score-per', 'Top 3 cities').should('be.visible');
            cy.contains('app-score-per button', 'Try Again').should('be.visible');
          } else {
            cy.contains('h3', 'Property Tax Health Score').should('be.visible');
            cy.get('mat-horizontal-stepper').should('be.visible');
          }
        });
      });
    });
  });

  it('questionnaire: Continue needs every answer, Back returns, nothing is submitted', function () {
    cy.get('@questions').its('response.body.0').then((q: any) => {
      cy.wait('@states').its('response.body.data').then((states: any[]) => {
        const target = states.find((s) => s.code === 'CG') || states[0];
        cy.get('app-score-per angular2-multiselect .c-btn').click();
        cy.contains('.dropdown-list:visible li.pure-checkbox', target.name).click();
        cy.wait('@ulbs').its('response.body.data.ulbs').then((ulbs: any[]) => {
          // Find a ULB with no existing score → questionnaire path.
          const sorted = [...ulbs].sort((a, b) => a.name.localeCompare(b.name));
          cy.get('app-score-per select.form-select').select(sorted[0]._id);
          cy.contains('app-score-per button', 'Get Started').click();
          cy.wait('@report').then(({ response }) => {
            if (response!.body.data) {
              // Already scored: "Try Again" re-opens the questionnaire.
              cy.contains('app-score-per button', 'Try Again').click();
              cy.wait('@report');
            }
            cy.get('mat-horizontal-stepper').should('be.visible');
            ['Enumeration', 'Valuation', 'Assessment'].forEach((l) =>
              cy.contains('mat-horizontal-stepper .mat-step-label span', l).should('exist'));
            cy.get('.mat-horizontal-stepper-content:not(.mat-horizontal-stepper-content-inactive)').within(() => {
              cy.get('.str-Qus').should('contain.text', q.enumeration[0].question.text);
              cy.get('.btn-div').should('have.length', q.enumeration.length);
              cy.contains('button', 'Continue').should('be.disabled');
              cy.get('.btn-div').each(($d, i) => {
                if (i < q.enumeration.length - 1) cy.wrap($d).contains('label', 'Yes').click();
              });
              cy.contains('button', 'Continue').should('be.disabled');
              cy.get('.btn-div').last().contains('label', 'No').click();
              cy.get('.btn-div').last().contains('label', 'No').should('have.class', 'active');
              cy.contains('button', 'Continue').should('not.be.disabled').click();
            });
            cy.get('.mat-horizontal-stepper-content:not(.mat-horizontal-stepper-content-inactive)').within(() => {
              cy.get('.str-Qus').should('contain.text', q.valuation[0].question.text);
              cy.contains('button', 'Back').click();
            });
            cy.get('.mat-horizontal-stepper-content:not(.mat-horizontal-stepper-content-inactive) .str-Qus')
              .should('contain.text', q.enumeration[0].question.text);
            // Close the score card.
            cy.get('app-score-per a img[src*="Icon feather-menu"]').parent().click();
            cy.get('mat-horizontal-stepper').should('not.exist');
          });
        });
      });
    });
  });
});

describe('Public | Resources — Best Practices', () => {
  function visitBp() {
    cy.intercept('GET', RE_PDF_LIST).as('bp');
    cy.intercept('GET', '**/api/v1/resourceDashboard/allYears/**').as('years');
    cy.intercept('GET', /\/api\/v1\/state$/).as('states');
    stubPdfThumbnails();
    cy.visit(`${LC}/bestPractices`);
    cy.wait('@bp'); // initial, unfiltered
    cy.wait('@years');
    return cy.wait('@bp'); // filter component emits with the default (latest) year
  }

  function assertCards(data: any[]) {
    if (!data.length) {
      cy.contains('app-best-practices p', 'Sorry we couldn’t find any matches for').should('be.visible');
      cy.get('app-best-practices .h-c').should('not.exist');
      return;
    }
    cy.get('app-best-practices .h-c').should('have.length', data.length);
    data.forEach((d, i) => {
      cy.get('app-best-practices .h-c').eq(i).should('contain.text', d.name.trim());
      cy.get('app-best-practices .card-body').eq(i).find('a')
        .should('have.attr', 'href', toStorageUrl(d.downloadUrl)).and('have.attr', 'target', '_blank');
    });
  }

  it('loads best practices for the latest year and shows the info text, dates and PDF links', () => {
    visitBp().then(({ request, response }) => {
      cy.get('@years').its('response.body.data').then((yrs: string[]) => {
        const latest = [...yrs].sort((a, b) => b.localeCompare(a))[0];
        expect(qs(request.url).get('year')).to.eq(latest);
        expect(qs(request.url).get('subHeader')).to.eq('best_practices');
        cy.get('mat-select[formcontrolname="year"]').should('contain.text', latest);
      });
      cy.contains('app-best-practices .info-text', 'Various states and cities have taken initiatives').should('be.visible');
      assertCards(response!.body.data || []);
      if (response!.body.data.length) {
        const t = new Date();
        cy.get('app-best-practices .icon-text').first()
          .should('contain.text', 'Updated on')
          .and('contain.text', `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`);
      }
    });
  });

  it('year dropdown offers "All Years" + API years and refetches', () => {
    visitBp();
    cy.get('@years').its('response.body.data').then((yrs: string[]) => {
      const sorted = [...yrs].sort((a, b) => b.localeCompare(a));
      cy.get('mat-select[formcontrolname="year"]').click();
      cy.get('.mat-select-panel mat-option').then(($o) => {
        expect([...$o].map((o) => o.innerText.trim())).to.deep.eq(['All Years', ...sorted]);
      });
      cy.contains('.mat-select-panel mat-option', 'All Years').click();
      cy.wait('@bp').then(({ request, response }) => {
        expect(qs(request.url).get('year')).to.eq('');
        assertCards(response!.body.data || []);
      });
    });
  });

  it('state filter narrows the list to that state (or shows the empty message)', () => {
    visitBp();
    cy.contains('mat-select[formcontrolname="year"]', /\d{4}-\d{2}/);
    selectAllYears();
    cy.wait('@bp').its('response.body.data').then((all: any[]) => {
      cy.wait('@states').its('response.body.data').then((states: any[]) => {
        const withData = states.find((s) => !s.isUT && all.some((d) => d.state === s._id));
        const st = withData || states.find((s) => !s.isUT);
        cy.get('mat-select[formcontrolname="state"]').click();
        cy.contains('.mat-select-panel mat-option', new RegExp(`^\\s*${st.name}\\s*$`)).click();
        cy.wait('@bp').then(({ request, response }) => {
          expect(qs(request.url).get('state')).to.eq(st._id);
          ((response!.body.data || []) as any[]).forEach((d) => expect(d.state).to.eq(st._id));
          assertCards(response!.body.data || []);
        });
      });
    });
  });

  it('a year with no best practices shows the "Sorry" empty message', function () {
    visitBp();
    cy.get('@years').its('response.body.data').then((yrs: string[]) => {
      cy.get('mat-select[formcontrolname="state"]').click();
      cy.get('.mat-select-panel mat-option').last().click(); // last state alphabetically
      cy.wait('@bp').then(({ response }) => {
        // The API answers 'No Resource Found' (success:false, no data) when empty.
        if ((response!.body.data || []).length) { cy.log('Unexpected data for this state'); this.skip(); }
        expect(response!.body.success).to.eq(false);
        assertCards([]);
        expect(yrs.length).to.be.greaterThan(0);
      });
    });
  });

  it('Clear All resets to all years / all states', () => {
    visitBp();
    cy.get('button[title="Clear selection(s)"]').click();
    cy.wait('@bp').then(({ request, response }) => {
      const q = qs(request.url);
      expect(q.get('year')).to.eq('');
      expect(q.get('state')).to.eq('');
      assertCards(response!.body.data || []);
    });
  });

  function selectAllYears() {
    cy.get('mat-select[formcontrolname="year"]').click();
    cy.contains('.mat-select-panel mat-option', 'All Years').click();
  }
});

describe('Public | Resources — E-Learning Modules', () => {
  const CARDS = ['Digitization of Properties Register', 'Valuation of Properties', 'Motivating Revenue Officials'];

  it('lists the three e-learning modules', () => {
    cy.visit(`${LC}/eLearning`);
    cy.get('app-e-learning-module .card').should('have.length', 3).each(($c, i) => {
      expect($c.text().trim()).to.eq(CARDS[i]);
      expect($c.find('img').attr('alt')).to.eq(CARDS[i]);
    });
  });

  CARDS.forEach((name) => {
    it(`opening "${name}" replaces the cards with the module description`, () => {
      cy.visit(`${LC}/eLearning`);
      cy.contains('app-e-learning-module .card', name).click();
      cy.get('app-e-learning-module .card').should('not.exist');
      cy.get('app-e-learning-module .frame .sub-ans').should('have.length', 1)
        .and('be.visible')
        .and('contain.text', 'This e-learning module serves to inform city leadership');
      // The embedded iSpring players are commented out in the template.
      cy.get('app-e-learning-module iframe').should('not.exist');
    });
  });
});

describe('Public | Resources — Municipal Laws', () => {
  beforeEach(() => {
    cy.intercept('GET', /\/api\/v1\/+state$/).as('states');
    cy.intercept('GET', '**/assets/files/municipal-laws.json').as('laws');
    cy.visit(`${LC}/municipal-laws`);
    cy.wait(['@states', '@laws']);
  });

  it('shows the overview, carousel captions and the India map', () => {
    // The "Municipal Laws" header bar (.b-sm) is mobile-only (<=551px).
    cy.contains('.head-content h5', 'Municipal Laws').should('not.be.visible');
    cy.contains('h3.title', 'Comparison of Municipal Finance Provisions').should('be.visible');
    cy.contains('.lowerText', 'The comparison attempts to answer a total of 70 questions across 13').should('be.visible');
    cy.get('ul.ulListText li').should('have.length', 5);
    cy.get('#finance-law-map.leaflet-container').should('exist');
    cy.get('carousel slide').should('have.length.greaterThan', 1);
    cy.contains('carousel .carousel-caption h4', 'States following Accrual Basis of Accounting').should('exist');
  });

  it('carousel hides its prev/next controls and auto-advances to the next caption', () => {
    // .carousel-control is display:none on the law page; slides rotate on a timer.
    cy.get('carousel .carousel-control').should('not.be.visible');
    cy.get('carousel slide.active .carousel-caption h4').invoke('text').then((first) => {
      cy.get('carousel slide.active .carousel-caption h4', { timeout: 15000 })
        .should(($h) => expect($h.text()).not.to.eq(first));
    });
  });

  it('Compare States lists states; selecting toggles; View and Compare needs a state', () => {
    cy.get('@states').its('response.body.data').then((states: any[]) => {
      cy.contains('button', 'Compare States').click();
      cy.get('.m-law .stateSearchButton').should('have.length', states.length);
      // Negative: nothing selected → stays on the selection step.
      cy.contains('button', 'View and Compare').click();
      cy.get('#compare-table').should('not.exist');
      cy.get('.m-law .stateSearchButton').first().click().should('have.class', 'btn-selected');
      cy.get('.m-law .stateSearchButton').first().click().should('not.have.class', 'btn-selected');
      cy.get('.m-law .stateSearchButton').eq(0).click();
      cy.get('.m-law .stateSearchButton').eq(1).click();
      cy.get('.m-law .btn-selected').should('have.length', 2);
      cy.get('button.clearButton').contains('Clear All').click();
      cy.get('.m-law .btn-selected').should('have.length', 0);
      // Back to the map view.
      cy.contains('a.back-link', 'Back').click();
      cy.contains('button', 'Compare States').should('be.visible');
    });
  });

  it('comparison table shows the chosen states and expandable criteria; Back returns to the map', () => {
    cy.get('@states').its('response.body.data').then((states: any[]) => {
      cy.contains('button', 'Compare States').click();
      cy.get('.m-law .stateSearchButton').eq(0).click();
      cy.get('.m-law .stateSearchButton').eq(1).click();
      cy.contains('button', 'View and Compare').click();
      cy.get('#compare-table th').should('have.length', 3).then(($th) => {
        const heads = [...$th].map((t) => t.innerText.trim().toLowerCase());
        expect(heads[0]).to.eq('criteria');
        expect(heads.slice(1)).to.deep.eq([states[0].name.toLowerCase(), states[1].name.toLowerCase()]);
      });
      cy.get('accordion-group').should('have.length', 14);
      cy.get('accordion-group').first().find('.panel-collapse, .collapse').should('not.have.class', 'show');
      cy.get('accordion-group').first().find('[accordion-heading], .accordion-toggle').first().click();
      cy.get('accordion-group').first().find('table tr').should('have.length.greaterThan', 0).and('be.visible');
      cy.contains('a.back-link', 'Back').click();
      cy.get('#compare-table').should('not.exist');
      cy.contains('h3.title', 'Comparison of Municipal Finance Provisions').should('be.visible');
    });
  });

  it('Compare All puts every state in the table', () => {
    cy.get('@states').its('response.body.data').then((states: any[]) => {
      cy.contains('button', 'Compare States').click();
      cy.contains('button', 'Compare All').click();
      cy.get('#compare-table th').should('have.length', states.length + 1);
    });
  });

  it('the add/remove states modal updates the comparison', () => {
    cy.contains('button', 'Compare States').click();
    cy.get('.m-law .stateSearchButton').eq(0).click();
    cy.get('.m-law .stateSearchButton').eq(1).click();
    cy.contains('button', 'View and Compare').click();
    cy.contains('button.btn-warning', 'Compare States').click();
    cy.contains('.modal-title', 'Add / Remove states from comparison').should('be.visible');
    cy.get('.modal-body .stateSearchButton.btn-selected').should('have.length', 2);
    cy.get('.modal-body .stateSearchButton').eq(2).click().should('have.class', 'btn-selected');
    cy.get('#compare-table th').should('have.length', 4);
    cy.contains('.modal-body button', 'Apply Selection').click();
    cy.get('.modal-title').should('not.exist');
    cy.get('#compare-table th').should('have.length', 4);
  });

  it('Download while logged out asks to log in; Cancel closes the dialog', () => {
    cy.window().then((w) => cy.stub(w, 'open').as('winOpen'));
    cy.contains('button', 'Compare States').click();
    cy.contains('button', 'Compare All').click();
    cy.contains('button.searchButton', 'Download').click();
    cy.get('mat-dialog-container').should('contain.text', 'You need to be Login to download the data.').within(() => {
      cy.contains('button', 'Proceed to Login').should('be.visible');
      cy.contains('button', 'Signup').should('be.visible');
      cy.contains('button', 'Cancel').click();
    });
    cy.get('mat-dialog-container').should('not.exist');
    cy.get('@winOpen').should('not.have.been.called');
  });

  it('at phone width the mobile header bar appears and its back arrow goes home', () => {
    cy.viewport(375, 812);
    cy.contains('.head-content h5', 'Municipal Laws').should('be.visible');
    cy.get('.back-icon a').should('be.visible').click();
    cy.location('pathname').should('eq', '/v1/home');
  });
});

describe('Public | Resources — Glossary (faqs)', () => {
  it('shows the Term/Definition table and the standardisation PDF link from link-record', () => {
    cy.intercept('GET', '**/api/v1/link-record?key=11').as('link');
    cy.visit(`${LC}/faqs`);
    lcTab('Glossary').should('have.class', 'active');
    cy.wait('@link').its('response.body.data.url').then((url: string) => {
      cy.contains('app-faq-table a', 'How We Standardize Annual Financial Statements')
        .should('have.attr', 'href', toStorageUrl(url)).and('have.attr', 'target', '_blank');
    });
    cy.get('app-faq-table table th').then(($th) => {
      expect([...$th].map((t) => t.innerText.trim())).to.deep.eq(['Term', 'Definition']);
    });
    cy.get('app-faq-table tbody tr').should('have.length.greaterThan', 50);
    cy.get('app-faq-table tbody tr').first().find('td').first().should('contain.text', 'Account');
    cy.contains('app-faq-table tbody td', 'Un-assessed Property').next()
      .should('contain.text', 'Sum of exempted properties and unrecorded properties within municipal limits.');
    // Every row has a non-empty term and definition.
    cy.get('app-faq-table tbody tr').each(($tr) => {
      const tds = $tr.find('td');
      expect(tds.length).to.eq(2);
      expect(tds.eq(0).text().trim()).not.to.eq('');
      expect(tds.eq(1).text().trim()).not.to.eq('');
    });
  });
});

describe('Public | Resources — Municipal Bond Repository', () => {
  function visitRepo() {
    cy.intercept('GET', '**/api/v1/main_category/list').as('cats');
    cy.intercept('GET', '**/api/v1/sub_category/list?categoryId=*').as('subs');
    cy.intercept('GET', '**/api/v1/municipalBondRepository/list*').as('list');
    stubPdfThumbnails();
    cy.visit(`${LC}/municipal-bond-repository`);
    cy.wait('@cats');
    return cy.wait('@list');
  }

  function assertRepo(data: any[]) {
    if (!data.length) {
      cy.contains('app-municipal-bond-repository p', 'No repository found').should('be.visible');
      cy.get('app-municipal-bond-repository .file-name').should('not.exist');
      return;
    }
    cy.get('app-municipal-bond-repository a[target="_blank"]').should('have.length', data.length);
    data.forEach((d, i) => {
      cy.get('app-municipal-bond-repository a[target="_blank"]').eq(i)
        .should('have.attr', 'href', toStorageUrl(d.file.url))
        .find('.file-name').should('contain.text', d.file.name.trim());
    });
  }

  it('lists every repository file from the API with the SEBI info text', () => {
    visitRepo().then(({ request, response }) => {
      expect(new URL(request.url).search).to.eq('');
      cy.contains('app-municipal-bond-repository .info-text', 'Securities and Exchange Board of India').should('be.visible');
      assertRepo(response!.body.data);
    });
  });

  it('category dropdown lists the API categories; choosing one loads sub-categories and filters', () => {
    visitRepo();
    cy.get('@cats').its('response.body.data').then((cats: any[]) => {
      cy.get('app-municipal-bond-repository select').first().find('option')
        .should('have.length', cats.length + 1).first().should('have.text', 'Category');
      const cat = cats[0];
      cy.get('app-municipal-bond-repository select').first().select(cat.name);
      cy.wait('@subs').then(({ request, response }) => {
        expect(qs(request.url).get('categoryId')).to.eq(cat._id);
        cy.get('app-municipal-bond-repository select').eq(1).find('option')
          .should('have.length', response!.body.data.length + 1);
      });
      cy.wait('@list').then(({ request, response }) => {
        expect(qs(request.url).get('categoryId')).to.eq(cat._id);
        assertRepo(response!.body.data);
      });
    });
  });

  it('sub-category filter narrows the list', function () {
    visitRepo();
    cy.get('@cats').its('response.body.data').then((cats: any[]) => {
      cy.get('app-municipal-bond-repository select').first().select(cats[0].name);
      cy.wait('@subs').its('response.body.data').then((subs: any[]) => {
        cy.wait('@list');
        if (!subs.length) { cy.log('No sub-categories'); this.skip(); }
        cy.get('app-municipal-bond-repository select').eq(1).select(subs[0].name);
        cy.wait('@list').then(({ request, response }) => {
          expect(qs(request.url).get('categoryId')).to.eq(cats[0]._id);
          expect(qs(request.url).get('subCategoryId')).to.eq(subs[0]._id);
          assertRepo(response!.body.data);
        });
      });
    });
  });

  it('a category with no files shows "No repository found"', function () {
    visitRepo();
    cy.get('@cats').its('response.body.data').then((cats: any[]) => {
      const empty = cats.find((c) => c.typeOfCategory && c.typeOfCategory !== 'municipal_bond_repository');
      if (!empty) { cy.log('No non-repository category to use as an empty case'); this.skip(); }
      cy.get('app-municipal-bond-repository select').first().select(empty.name);
      cy.wait('@list').then(({ response }) => {
        if (response!.body.data.length) { cy.log('Category unexpectedly has files'); this.skip(); }
        assertRepo([]);
      });
    });
  });

  it('Clear All reloads the unfiltered list', () => {
    visitRepo().then(({ response: initial }) => {
      cy.get('@cats').its('response.body.data').then((cats: any[]) => {
        cy.get('app-municipal-bond-repository select').first().select(cats[0].name);
        cy.wait('@list');
        cy.contains('app-municipal-bond-repository button.clearBtn', 'Clear All').click();
        cy.wait('@list').then(({ request, response }) => {
          expect(new URL(request.url).search).to.eq('');
          expect(response!.body.data.length).to.eq(initial!.body.data.length);
          assertRepo(response!.body.data);
        });
      });
    });
  });
});
