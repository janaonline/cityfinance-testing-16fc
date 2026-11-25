/**
 * XVI-FC Grant Portal — Portal Admin ADC create / rename / change Admin / delete (TS-1352).
 *
 * !!! MUTATING: creates real ADCs and invites ADC Admins on staging, each recorded
 * in the ADC audit log. Excluded from default runs (*Mutating.cy.ts).
 *
 * Every name starts "QA Test ADC" and every Admin email is @example.com (a domain
 * reserved for tests: no real mailbox gets the invite).
 *   ADC A: create → duplicate name refused → rename → delete. Nothing is left behind.
 *   ADC B: create → change Admin (invite a new person) → delete is now refused,
 *          because the old Admin stays on as a Reviewer. ADC B STAYS on staging:
 *          the Portal Admin cannot remove members (only the ADC Admin can).
 *          So it runs only with --env CREATE_ADC_B=1; each such run leaves one more ADC B.
 * The ADCs are created in the State from .env's State login (Tripura).
 */
import { loginAsAdmin, visitWorkspacePage } from '../../support/xvifcSession';

export {};

const STAMP = String(Date.now()).slice(-6);
const STATE = 'Tripura';
const ADC_A = `QA Test ADC A ${STAMP}`;
const ADC_A_RENAMED = `QA Test ADC A ${STAMP} renamed`;
const ADC_B = `QA Test ADC B ${STAMP}`;
const ADC_API = '**/api/v2/master/adc';

function mobile(n: number): string {
  return `9${STAMP}${String(n).padStart(3, '0')}`.slice(0, 10);
}

function openList() {
  cy.intercept('GET', `${ADC_API}/manage*`).as('manage');
  visitWorkspacePage('adc');
  cy.wait('@manage');
}

/** Waits until the list shows this search: the URL carries it and every row (if any) matches it. */
function waitForSearch(term: string): void {
  cy.location("search", { timeout: 15000 }).should("include", "search=" + encodeURIComponent(term));
  cy.get("app-pre-loader").should("not.exist");
  cy.get("body").should(($b) => {
    const rows = [...$b.find("tr.mat-mdc-row")];
    rows.forEach((r) => expect(r.textContent ?? "").to.include(term));
  });
}

/** Searches the list for one ADC and yields its row once the filtered list has rendered. */
function findRow(name: string) {
  cy.get('#adc-list-search').clear().type(name);
  waitForSearch(name);
  cy.contains('.text-muted', /Total: \d+/).should('exist');
  return cy.contains('tr.mat-mdc-row', name, { timeout: 10000 });
}

function fillAdmin(prefix: string, n: number) {
  cy.contains('mat-dialog-container mat-form-field', 'Name').find('input').clear().type(`QA Admin ${prefix}`);
  cy.contains('mat-dialog-container mat-form-field', 'Email').find('input').clear().type(`qa.adc.${prefix.toLowerCase()}.${STAMP}@example.com`);
  cy.contains('mat-dialog-container mat-form-field', 'Mobile').find('input').clear().type(mobile(n));
  cy.contains('mat-dialog-container mat-form-field', 'Designation').find('input').clear().type('QA Tester');
}

function addAdc(name: string, prefix: string, n: number) {
  cy.contains('button', 'Add ADC').click();
  cy.get('mat-select[formcontrolname="stateId"]').click();
  cy.get('mat-option', { timeout: 20000 }).should('have.length.greaterThan', 1);
  cy.contains('mat-option', new RegExp(`^\\s*${STATE}\\s*$`)).click();
  cy.get('input[formcontrolname="name"]').type(name);
  fillAdmin(prefix, n);
  cy.intercept('POST', ADC_API).as('create');
  cy.get('mat-dialog-actions').contains('button', 'Add ADC').click();
}

describe('XVI-FC Grant | Portal Admin — ADC lifecycle (TS-1352, MUTATING)', () => {
  beforeEach(() => {
    loginAsAdmin();
    openList();
  });

  it('A: adds an ADC with its Admin; it lists with 0 ULBs, 1 member and the Admin "Invited"', () => {
    addAdc(ADC_A, 'A', 1);
    cy.wait('@create').its('response.statusCode').should('be.oneOf', [200, 201]);
    cy.contains('h2', 'Add ADC').should('not.exist');
    findRow(ADC_A).within(() => {
      cy.get('td').eq(1).should('contain.text', STATE);
      cy.get('td').eq(2).invoke('text').invoke('trim').should('eq', '0');
      cy.get('td').eq(3).invoke('text').invoke('trim').should('eq', '1');
      cy.get('td').eq(4).should('contain.text', 'QA Admin A').and('contain.text', `qa.adc.a.${STAMP}@example.com`)
        .find('.badge').should('contain.text', 'Invited');
    });
  });

  it('A: refuses a second ADC with the same name in the same state (any case), and keeps nothing', () => {
    addAdc(ADC_A.toUpperCase(), 'Dup', 2);
    cy.wait('@create').its('response.statusCode').should('eq', 409);
    cy.get('mat-dialog-container .alert-danger').should('contain.text', 'An ADC with this name already exists in this state.');
    cy.get('mat-dialog-actions').contains('button', 'Cancel').click();
    cy.get('#adc-list-search').clear().type(ADC_A);
    cy.wait('@manage');
    cy.get('tr.mat-mdc-row').should('have.length', 1);
  });

  it('A: renames it (the state cannot change)', () => {
    findRow(ADC_A).find('[data-test="adc-menu"]').click();
    cy.get('[data-test="rename"]').click();
    cy.contains('mat-form-field', 'State').find('input').should('be.disabled').and('have.value', STATE);
    cy.intercept('PATCH', `${ADC_API}/*`).as('rename');
    cy.get('input[formcontrolname="name"]').clear().type(ADC_A_RENAMED);
    cy.get('mat-dialog-actions').contains('button', 'Save').click();
    cy.wait('@rename').its('response.statusCode').should('eq', 200);
    findRow(ADC_A_RENAMED).should('exist');
  });

  it('A: deletes an ADC that has only its Admin, after a confirmation', () => {
    findRow(ADC_A_RENAMED).find('[data-test="adc-menu"]').click();
    cy.get('[data-test="delete-reason"]').should('not.exist');
    cy.get('[data-test="delete"]').click();
    cy.contains('Delete ADC').should('be.visible');
    cy.contains(`Delete ${ADC_A_RENAMED} (${STATE})?`).should('be.visible');
    cy.contains('This cannot be undone.').should('be.visible');
    cy.intercept('DELETE', `${ADC_API}/*`).as('delete');
    cy.get('mat-dialog-container').last().contains('button', /^\s*Delete\s*$/).click();
    cy.wait('@delete').its('response.statusCode').should('eq', 200);
    cy.get('#adc-list-search').clear().type(ADC_A_RENAMED);
    cy.wait('@manage');
    cy.get('[data-test="empty-filtered"]').should('contain.text', 'No ADCs match these filters.');
  });

  it('B: changing the Admin (invite) replaces the Admin; the old one stays as a member, so delete is refused', function () {
    // ADC B can't be deleted afterwards, so it only runs when asked: --env CREATE_ADC_B=1.
    if (!Cypress.env('CREATE_ADC_B')) this.skip();
    // Reuse an ADC B left by an earlier run that has not had its Admin changed yet (1 member).
    cy.get('#adc-list-search').clear().type('QA Test ADC B');
    waitForSearch('QA Test ADC B');
    cy.get('body').then(($b) => {
      const row = [...$b.find('tr.mat-mdc-row')].find((r) => r.querySelectorAll('td')[3]?.textContent?.trim() === '1');
      const name = row?.querySelector('td')?.textContent?.trim();
      if (name) {
        cy.wrap(name.slice(-6)).as('stamp');
        cy.wrap(name).as('adcB');
      } else {
        addAdc(ADC_B, 'B', 3);
        cy.wait('@create').its('response.statusCode').should('be.oneOf', [200, 201]);
        cy.wrap(STAMP).as('stamp');
        cy.wrap(ADC_B).as('adcB');
      }
    });
    cy.get<string>('@stamp').then((stamp) => cy.get<string>('@adcB').then((adcB) => changeAdminAndCheck(adcB, stamp)));
  });
});

/** `bStamp` is ADC B's own stamp (its first Admin's email); the new Admin uses this run's STAMP. */
function changeAdminAndCheck(ADC_B: string, bStamp: string) {
    findRow(ADC_B).find('[data-test="adc-menu"]').click();
    cy.get('[data-test="change-admin"]').click();
    cy.contains(`Current Admin: QA Admin B (qa.adc.b.${bStamp}@example.com)`).should('be.visible');
    // An invited Admin is not verified, so there is no one to promote yet.
    cy.contains('mat-radio-button', 'Promote an existing member').find('input').should('be.disabled');
    cy.contains('mat-radio-button', 'Invite a new person').click();
    fillAdmin('Bnew', 4);
    cy.intercept('PUT', `${ADC_API}/*/admin`).as('setAdmin');
    cy.get('mat-dialog-actions button').last().click();
    cy.wait('@setAdmin').its('response.statusCode').should('eq', 200);

    findRow(ADC_B).within(() => {
      cy.get('td').eq(3).invoke('text').invoke('trim').should('eq', '2');
      cy.get('td').eq(4).should('contain.text', `qa.adc.bnew.${STAMP}@example.com`)
        .and('not.contain.text', `qa.adc.b.${bStamp}@example.com`);
    });
    // Only one Admin: the members tab shows one Admin and the old one at another level.
    findRow(ADC_B).find('[data-test="member-count-link"]').click();
    cy.get('app-adc-members-table tr.mat-mdc-row').should('have.length', 2);
    cy.get('app-adc-members-table').invoke('text').then((text) => {
      expect(text).to.include(`qa.adc.b.${bStamp}@example.com`).and.include(`qa.adc.bnew.${STAMP}@example.com`);
    });

    openList();
    findRow(ADC_B).find('[data-test="adc-menu"]').click();
    cy.get('[data-test="delete-reason"]').invoke('text').should('match', /1 other member/);
}
