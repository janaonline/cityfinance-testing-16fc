/**
 * XVI-FC Grant Portal — MoHUA "Generate OM" (OM Generation).
 * URLs: /fc/xvifc/{yearId}/om-generation[/letter/{claimLetterId}]
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (mohua-module) and checked against staging.
 *
 * Read-only: every write is blocked and the afterEach fails the test if one
 * is attempted. Expected values come from the live API responses, so the spec
 * holds whatever data exists on staging.
 *
 * Only issued OMs are opened. The OM No./Dated boxes are never focused:
 * leaving one saves a draft OM without confirmation.
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

describe('XVI-FC Grant | MoHUA — Generate OM', () => {
  beforeEach(() => {
    cy.intercept('GET', new RegExp(`/mohua/om/${HEX}/1$`)).as('omStates');
    visitWorkspacePage('om-generation');
    cy.wait('@omStates').its('response.body.data').as('omData');
  });

  it('shows the three OM steps with Generate OM current', () => {
    cy.get('ol.om-steps li').should('have.length', 3);
    cy.get('li.om-step--current').should('have.attr', 'aria-current', 'step').and('contain.text', 'Generate OM');
    cy.contains('h1', 'Generate OM').should('be.visible');
  });

  it('groups the verified claim letters by state', () => {
    cy.get('@omData').then((d: any) => {
      const letters = d.states.flatMap((s: any) => s.claimLetters);
      if (!letters.length) {
        cy.contains('No claim letter has been verified yet. Verified letters appear here.').should('be.visible');
        return;
      }
      cy.get('tr.om-state-row').should('have.length', d.states.length);
      d.states.forEach((s: any) => {
        cy.contains('tr.om-state-row', s.stateName)
          .should('contain.text', `${s.claimLetters.length} claim letter${s.claimLetters.length === 1 ? '' : 's'}`);
      });
      letters.forEach((l: any) => {
        const issued = l.omStatus === 'GENERATED' || l.omStatus === 'SIGNED_UPLOADED';
        cy.contains('tr', l.claimLetterRefNo).within(() => {
          cy.get('.cs-badge').should('contain.text', l.omStatus === 'SIGNED_UPLOADED' ? 'OM Signed' : issued ? 'OM Issued' : 'Verified by MoHUA');
          cy.contains('a', issued ? 'View OM' : 'Generate OM').should('be.visible');
        });
      });
    });
  });

  it('opens an issued OM read-only and downloads its PDF', function () {
    cy.get('@omData').then((d: any) => {
      const issued = d.states.flatMap((s: any) => s.claimLetters).find((l: any) => l.omStatus === 'GENERATED' || l.omStatus === 'SIGNED_UPLOADED');
      if (!issued) this.skip();
      cy.intercept('GET', new RegExp(`/mohua/om/letter/${HEX}/document$`)).as('omDoc');
      cy.contains('tr', issued.claimLetterRefNo).contains('a', 'View OM').click();
      cy.wait('@omDoc').its('response.body.data').then((doc: any) => {
        cy.contains('h1', `Generate OM — ${doc.content.claimLetterRefNo}`).should('be.visible');
        cy.get('.om-editor__sub').should('contain.text', 'Issued — read-only');
        cy.contains('.oml-tile__label', `Issued as ${doc.refNo}`).should('be.visible');
        cy.get('li.om-step--current').should('contain.text', 'Upload Signed OM');
        cy.contains('OFFICE MEMORANDUM').should('exist');

        // ULB list is collapsed until toggled (client-side).
        cy.get('button.oml-ulbs__toggle').should('have.attr', 'aria-expanded', 'false').click();
        cy.get('#oml-ulb-list tbody tr').should('have.length', doc.ulbs.length || 1);

        cy.intercept('GET', new RegExp(`/mohua/om/${HEX}/pdf$`)).as('omPdf');
        cy.contains('button', 'Download OM (PDF)').click();
        cy.wait('@omPdf').its('response.statusCode').should('eq', 200);
      });
      cy.contains('a', 'Back to Generate OM').click();
      cy.location('pathname').should('match', /\/om-generation$/);
    });
  });
});
