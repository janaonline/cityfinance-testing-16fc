/**
 * XVI-FC Grant Portal — MoHUA "Overview".
 * URL: /fc/xvifc/{yearId}/overview
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (mohua-module) and checked against staging.
 *
 * Read-only: every write is blocked and the afterEach fails the test if one
 * is attempted. Expected values come from the live API responses, so the spec
 * holds whatever data exists on staging.
 */
import { blockWrites, loginAsMohua, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const HEX = '[a-f0-9]{24}';

let blockedWrites: string[] = [];

beforeEach(() => {
  loginAsMohua();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

describe('XVI-FC Grant | MoHUA — Overview', () => {
  beforeEach(() => {
    cy.intercept('GET', new RegExp(`/mohua/overview/${HEX}$`)).as('overview');
    visitWorkspacePage('overview');
    cy.wait('@overview');
  });

  it("shows today's briefing and the state status filters", () => {
    cy.contains('XVI Finance Commission — Ministry of Housing and Urban Affairs').should('be.visible');
    ['Annual allocation', 'Instalment 1', 'Claims with MoHUA', 'State Progress Overview']
      .forEach((t) => cy.contains(t).should('exist'));
    ['Under Review by MoHUA', 'In Progress', 'Not Started']
      .forEach((t) => cy.contains('button.ob-stat', t).should('be.visible'));
  });

  it('switches the states view and searches states', () => {
    cy.contains('States at a glance').scrollIntoView().should('be.visible');
    cy.contains('mat-button-toggle', 'Claims & ULB progress').click();
    cy.get('input[placeholder="Search by state name"]').type('zzz-no-such-state');
    cy.contains('No state matches your search.').should('be.visible');
    cy.contains('mat-button-toggle', 'State progress').click();
  });
});
