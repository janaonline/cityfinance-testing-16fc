/**
 * XVI-FC Grant Portal — Portal Admin "ADC" page (TS-1352, part of TS-1085).
 * URLs: /fc/xvifc/{yearId}/adc, /fc/xvifc/{yearId}/adc/{id}
 * API:  /api/v2/master/adc[/manage|/:id|/:id/members|/:id/ulbs]
 *
 * The Portal Admin (role ADMIN, signs in through the MOHUA card) manages Assam's
 * Autonomous District Councils and their Admins. The State DMA no longer does:
 * the manage APIs refuse it and the old State "ADC Teams" page redirects.
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches.
 * Read-only: every write is blocked and the afterEach fails the test if one is
 * attempted. Dialogs are opened, validated and cancelled.
 */
import { blockWrites, loginAsAdmin, loginAsState, visitWorkspacePage } from '../../support/xvifcSession';

export {};

const MANAGE_API = '**/api/v2/master/adc/manage*';

let blockedWrites: string[] = [];

/** `{ success, data: { data: rows, total } }` or `{ data: rows, total }`. */
function pageOf(body: any): { rows: any[]; total: number } {
  const page = Array.isArray(body?.data) ? body : body?.data ?? {};
  return { rows: page.data ?? [], total: page.total ?? (page.data ?? []).length };
}

function token(): Cypress.Chainable<string> {
  return cy.window().then((w) => w.localStorage.getItem('cf_access_token') || w.localStorage.getItem('id_token') || '');
}

function openAdcList() {
  cy.intercept('GET', MANAGE_API).as('manage');
  visitWorkspacePage('adc');
  cy.wait('@manage').its('response.body').then((b) => cy.wrap(pageOf(b)).as('list'));
  cy.contains('h3', /^\s*ADC\s*$/).should('be.visible');
}

describe('XVI-FC Grant | Portal Admin — ADC list (TS-1352)', () => {
  beforeEach(() => {
    loginAsAdmin();
    blockedWrites = blockWrites();
    openAdcList();
  });

  afterEach(() => {
    expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
  });

  it('is in the Portal Admin sidebar, with Add ADC and the table columns', () => {
    cy.contains('a, .nav-link, li', /^\s*ADC\s*$/).should('exist');
    cy.contains('button', 'Add ADC').should('be.visible');
    ['ADC Name', 'State', 'ULBs', 'Members', 'ADC Admin', 'Actions']
      .forEach((h) => cy.contains('th', h).should('exist'));
  });

  it('shows each ADC as the API sends it (name, state, ULB and member counts, Admin)', () => {
    cy.get('@list').then(({ rows, total }: any) => {
      cy.contains('.text-muted', `Total: ${total}`).should('exist');
      if (!rows.length) {
        cy.get('[data-test="empty"]').should('contain.text', 'No ADCs yet.');
        return;
      }
      cy.get('table[aria-label="Autonomous District Councils"] tr.mat-mdc-row').should('have.length', rows.length);
      rows.forEach((r: any) => {
        cy.contains('tr.mat-mdc-row', r.name).within(() => {
          cy.get('td').eq(1).should('contain.text', r.state?.name ?? '-');
          cy.get('td').eq(2).invoke('text').invoke('trim').should('eq', String(r.ulbCount));
          cy.get('td').eq(3).invoke('text').invoke('trim').should('eq', String(r.memberCount));
          if (r.admin) {
            cy.get('td').eq(4).should('contain.text', r.admin.name).and('contain.text', r.admin.email);
            cy.get('td').eq(4).find('.badge').should(r.admin.isXVIFCProfileVerified ? 'not.exist' : 'contain.text', 'Invited');
          } else {
            cy.get('td').eq(4).should('contain.text', 'Not set');
          }
        });
      });
    });
  });

  it('pages at most 20 ADCs, even when more are asked for', () => {
    token().then((t) => {
      cy.request({ url: '/api/v2/master/adc/manage?page=1&limit=50', headers: { Authorization: `Bearer ${t}` }, failOnStatusCode: false })
        .then((res) => {
          if (res.status === 400) return; // limit rejected outright is also within the cap
          expect(pageOf(res.body).rows.length, 'rows returned').to.be.at.most(20);
        });
    });
    cy.get('mat-paginator').should('exist');
  });

  it('filters by state, searches by name, and says when nothing matches', () => {
    cy.get('@list').then(({ rows }: any) => {
      cy.get('#adc-list-state option').then(($o) => {
        const assam = [...$o].find((o) => o.textContent?.trim() === 'Assam');
        if (!assam) return;
        cy.get('#adc-list-state').select('Assam');
        cy.wait('@manage').then(({ request, response }) => {
          expect(request.url).to.include(`stateId=${(assam as HTMLOptionElement).value}`);
          pageOf(response!.body).rows.forEach((r: any) => expect(r.state?.name).to.eq('Assam'));
        });
      });
      if (rows[0]) {
        cy.get('#adc-list-search').clear().type(rows[0].name);
        cy.wait('@manage').its('request.url').should('include', 'search=');
        cy.contains('tr.mat-mdc-row', rows[0].name).should('exist');
      }
      cy.get('#adc-list-search').clear().type('zzz-no-such-adc');
      cy.get('[data-test="empty-filtered"]', { timeout: 10000 }).should('contain.text', 'No ADCs match these filters.');
      cy.get('[data-test="clear-filters"]').first().click();
      cy.get('#adc-list-search').should('have.value', '');
    });
  });

  it('offers the Admin status filter (All, and each status)', () => {
    cy.get('#adc-list-admin-status option').then(($o) => {
      const labels = [...$o].map((o) => o.textContent?.trim());
      expect(labels[0]).to.eq('Admin: All');
      expect(labels.length, 'status options').to.be.at.least(3);
    });
    cy.get('#adc-list-admin-status').select(1);
    cy.wait('@manage').its('request.url').should('match', /adminStatus=(ACTIVE|INVITED|NOT_SET)/);
  });

  it("View opens the ADC's page with its Members and ULBs tabs", function () {
    cy.get('@list').then(({ rows }: any) => {
      if (!rows.length) this.skip();
      const r = rows[0];
      cy.contains('tr.mat-mdc-row', r.name).find('[data-test="view"]').click();
      cy.location('pathname').should('match', new RegExp(`/adc/${r._id}$`));
      cy.get('#adc-detail-title').should('have.text', r.name);
      cy.contains('[role="tab"]', `Members (${r.memberCount})`).should('exist');
      cy.contains('[role="tab"]', `ULBs (${r.ulbCount})`).should('exist');
      cy.contains('[role="tab"]', 'ULBs').click();
      cy.get('app-adc-ulbs-table').should('exist');
    });
  });

  it('refuses to delete an ADC that has ULBs or other members, and says why', function () {
    cy.get('@list').then(({ rows }: any) => {
      const inUse = rows.find((r: any) => r.ulbCount > 0 || r.memberCount > 1);
      if (!inUse) this.skip();
      const others = inUse.memberCount - (inUse.admin ? 1 : 0);
      cy.contains('tr.mat-mdc-row', inUse.name).find('[data-test="adc-menu"]').click();
      cy.get('[data-test="delete-reason"]').invoke('text').then((reason) => {
        if (inUse.ulbCount) expect(reason).to.include(`${inUse.ulbCount} ULB`);
        if (others > 0) expect(reason).to.include(`${others} other member`);
      });
      cy.get('[data-test="delete"]').click();
      cy.contains('Delete ADC').should('not.exist'); // a blocked delete opens no confirmation
    });
  });

  it('Add ADC validates every field before sending anything (cancelled)', () => {
    cy.contains('button', 'Add ADC').click();
    cy.contains('h2', 'Add ADC').should('be.visible');
    cy.get('mat-dialog-actions').contains('button', 'Add ADC').click();
    ['Select a state.', 'Enter a name of up to', 'Enter a name (letters', 'Enter a valid email address.',
      'Enter a valid 10-digit mobile number.', 'Enter a designation'].forEach((e) => cy.contains('mat-error', e).should('exist'));
    cy.get('input[formcontrolname="email"]').type('not-an-email').blur();
    cy.contains('mat-error', 'Enter a valid email address.').should('exist');
    cy.get('input[formcontrolname="mobile"]').type('12345').blur();
    cy.contains('mat-error', 'Enter a valid 10-digit mobile number.').should('exist');
    cy.get('input[formcontrolname="adminName"]').type('Test 123').blur();
    cy.contains('mat-error', 'Enter a name (letters').should('exist');
    cy.get('mat-dialog-actions').contains('button', 'Cancel').click();
    cy.contains('h2', 'Add ADC').should('not.exist');
  });

  it("Rename keeps the state fixed (cancelled)", function () {
    cy.get('@list').then(({ rows }: any) => {
      if (!rows.length) this.skip();
      cy.contains('tr.mat-mdc-row', rows[0].name).find('[data-test="adc-menu"]').click();
      cy.get('[data-test="rename"]').click();
      cy.contains('h2', 'Edit ADC').should('be.visible');
      cy.contains('mat-form-field', 'State').find('input').should('be.disabled').and('have.value', rows[0].state.name);
      cy.contains("An ADC's state can't be changed.").should('be.visible');
      cy.get('input[formcontrolname="name"]').should('have.value', rows[0].name);
      cy.get('mat-dialog-actions').contains('button', 'Cancel').click();
    });
  });

  it('Change Admin names the current Admin and offers promote or invite (cancelled)', function () {
    cy.get('@list').then(({ rows }: any) => {
      const withAdmin = rows.find((r: any) => r.admin);
      if (!withAdmin) this.skip();
      cy.contains('tr.mat-mdc-row', withAdmin.name).find('[data-test="adc-menu"]').click();
      cy.get('[data-test="change-admin"]').should('contain.text', 'Change Admin').click();
      cy.contains('h2', `Change ADC Admin - ${withAdmin.name}`).should('be.visible');
      cy.contains(`Current Admin: ${withAdmin.admin.name} (${withAdmin.admin.email})`).should('be.visible');
      cy.contains('mat-radio-button', 'Promote an existing member').should('exist');
      cy.get('mat-dialog-actions').contains('button', 'Cancel').click();
    });
  });
});

describe('XVI-FC Grant | State DMA no longer manages ADCs (TS-1352)', () => {
  beforeEach(() => {
    loginAsState();
    blockedWrites = blockWrites();
  });

  afterEach(() => {
    expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
  });

  it('the old State "ADC Teams" page redirects to People and Roles', () => {
    visitWorkspacePage('adc-teams');
    cy.location('pathname', { timeout: 20000 }).should('match', /\/roles-teams-unified-view$/);
  });

  it('the Portal Admin ADC APIs refuse the State DMA (403)', () => {
    visitWorkspacePage('overview');
    token().then((t) => {
      const headers = { Authorization: `Bearer ${t}` };
      cy.request({ url: '/api/v2/master/adc/manage', headers, failOnStatusCode: false })
        .its('status').should('eq', 403);
      // The plain ADC list stays open to a State user, limited to its own state.
      cy.request({ url: '/api/v2/master/adc', headers, failOnStatusCode: false }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });
});
