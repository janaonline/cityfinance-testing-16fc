/**
 * XVI-FC Grant Portal — STATE "FC Unspent Declaration" form.
 * URL: /fc/xvifc/{yearId}/fc-unspent-declaration
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (state-module/fc-unspent-declaration) and checked against staging.
 *
 * The form is shared server-side state. GET .../fc-unspent-declaration/
 * {stateId}/{yearId} returns `permissions.canEdit`. Editable-form tests skip
 * (pending) when it is locked, and the locked-view test skips while it is
 * editable.
 *
 * Every write is blocked. Choosing Yes/No and adding ULBs through the picker
 * are client-only until Save. The "download the declaration" action is never
 * clicked after a change: with unsaved changes it becomes "Save & download",
 * which saves a draft without a confirm dialog.
 */
import { blockWrites, loginAsState, visitStatePage } from '../../support/xvifcState';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

let blockedWrites: string[] = [];

function openUnspentDeclaration() {
  cy.intercept('GET', '**/api/v2/xvi-fc/state/fc-unspent-declaration/*/*').as('unspentForm');
  visitStatePage('fc-unspent-declaration');
  cy.wait('@unspentForm').its('response.body.data').as('unspentData');
}

function requireEditable(ctx: Mocha.Context, wanted: boolean) {
  cy.get('@unspentData').then((data: any) => {
    if (Boolean(data.permissions?.canEdit) !== wanted) {
      cy.log(`FC Unspent Declaration is ${data.permissions?.canEdit ? 'editable' : 'locked'} — skipping`);
      ctx.skip();
    }
  });
}

function chooseYes() {
  cy.get('[data-cy="isFcUnspent-yes-test"] input[type="radio"]').check({ force: true });
  cy.contains('button', 'Add ULB').should('be.visible');
}

beforeEach(() => {
  loginAsState();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | STATE — FC Unspent Declaration page', () => {
  beforeEach(() => openUnspentDeclaration());

  it('shows the heading for the applicable Finance Commission', () => {
    cy.get('@unspentData').then((data: any) => {
      const fc = data.applicableFc === '15TH_FC' ? '15th' : '14th';
      cy.contains('h1', `Unspent ${fc} FC Balance Declaration`).should('be.visible');
      cy.contains(`If no ULB in your state holds any ${fc} FC unspent balance`).should('be.visible');
    });
    cy.contains(/Current Form Status/i).should('be.visible');
  });

  it('asks whether any ULB has an unspent balance', () => {
    cy.get('[data-cy="isFcUnspent-test"]').should('be.visible');
    cy.get('[data-cy="isFcUnspent-no-test"]').should('contain.text', 'No (no ULB in the state has unspent');
    cy.get('[data-cy="isFcUnspent-yes-test"]').should('contain.text', 'Yes (one or more ULBs have unspent');
  });
});

describe('XVI-FC Grant | STATE — FC Unspent Declaration editable form', () => {
  beforeEach(function () {
    openUnspentDeclaration();
    requireEditable(this, true);
  });

  it('shows Cancel, Save and Final Submit', () => {
    cy.get('[data-cy="fc-unspent-declaration-cancel-test"]').should('be.visible');
    cy.get('[data-cy="fc-unspent-declaration-submit-test"]').should('be.visible');
    cy.get('@unspentData').then((data: any) => {
      if (data.permissions?.canFinalSubmit) {
        cy.get('[data-cy="fc-unspent-declaration-final-submit-test"]').should('be.visible');
      }
    });
  });

  it('"No" asks for the signed state-level declaration', () => {
    cy.get('[data-cy="isFcUnspent-no-test"] input[type="radio"]').check({ force: true });
    cy.contains('State-Level Declaration').scrollIntoView().should('be.visible');
    cy.contains('Download the declaration').should('exist');
    cy.contains('button', 'Add ULB').should('not.exist');
  });

  it('"Yes" shows an empty ULB-wise table', () => {
    chooseYes();
    cy.contains('No ULBs added yet.').should('be.visible');
    ['ULB', 'Census Code', 'Previous FC Unspent Balance'].forEach((h) => cy.contains('th', h).should('exist'));
  });

  it('the ULB picker lists ULBs and adds a selection to the table only', () => {
    chooseYes();
    cy.intercept('GET', '**/fc-unspent-declaration/*/*/ulb-options*').as('ulbOptions');
    cy.contains('button', 'Add ULB').click();
    cy.wait('@ulbOptions').its('response.body.data').then((options: any[]) => {
      cy.contains('Select ULBs').should('be.visible');
      cy.get('#ulb-picker-search').should('be.visible');
      cy.get('[data-cy="ulb-picker-selected-count"]').should('contain.text', '0 ULBs selected');
      cy.get('[data-cy="ulb-picker-confirm"]').should('be.disabled');
      if (!options.length) return;

      cy.get('[data-cy="ulb-picker-row"]').first().click();
      cy.get('[data-cy="ulb-picker-selected-count"]').should('contain.text', '1 ULB selected');
      cy.get('[data-cy="ulb-picker-confirm"]').should('be.enabled').click();
      cy.get('#fc-unspent-amount-0').should('exist');
      cy.contains(options[0].ulbName).should('be.visible');

      cy.get('button[aria-label="Remove row"]').first().click();
      cy.contains('No ULBs added yet.').should('be.visible');
    });
  });

  it('closing the ULB picker adds nothing', () => {
    chooseYes();
    cy.contains('button', 'Add ULB').click();
    cy.contains('Select ULBs').should('be.visible');
    cy.get('button[aria-label="Close dialog"]').click();
    cy.contains('Select ULBs').should('not.exist');
    cy.contains('No ULBs added yet.').should('be.visible');
  });

  it('blocks Final Submit on "Yes" with no ULBs', function () {
    cy.get('@unspentData').then((data: any) => {
      if (!data.permissions?.canFinalSubmit) this.skip();
    });
    chooseYes();
    cy.get('[data-cy="fc-unspent-declaration-final-submit-test"]').click();
    cy.contains('Please correct the errors in the form before submitting.').should('be.visible');
    cy.get('.confirm-dialog-title').should('not.exist');
  });

  it('asks before discarding changes on Cancel', () => {
    cy.get('[data-cy="fc-unspent-declaration-cancel-test"]').click();
    cy.contains('.confirm-dialog-title', 'Discard changes?').should('be.visible');
    cy.contains('.confirm-dialog-btn', 'No, continue editing').click();
    cy.get('.confirm-dialog-title').should('not.exist');
  });

  it('warns about unsaved changes when leaving the page', () => {
    chooseYes();
    cy.contains('a, button, li', 'SFC Status').click({ force: true });
    cy.contains('Leave without saving?').should('be.visible');
    cy.contains('button', 'Stay on page').click();
    cy.location('pathname').should('match', /\/fc-unspent-declaration$/);
  });
});

describe('XVI-FC Grant | STATE — FC Unspent Declaration submitted view', () => {
  beforeEach(function () {
    openUnspentDeclaration();
    requireEditable(this, false);
  });

  it('hides Save and Final Submit', () => {
    cy.get('[data-cy="fc-unspent-declaration-submit-test"]').should('not.exist');
    cy.get('[data-cy="fc-unspent-declaration-final-submit-test"]').should('not.exist');
  });
});
