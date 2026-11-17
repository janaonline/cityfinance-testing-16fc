/**
 * XVI-FC Grant Portal — MoHUA "OM Generation History" (OM Generation).
 * URL: /fc/xvifc/{yearId}/om-history
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (mohua-module) and checked against staging.
 *
 * Read-only: every write is blocked and the afterEach fails the test if one
 * is attempted. Expected values come from the live API responses, so the spec
 * holds whatever data exists on staging.
 *
 * The signed-OM upload dialog is only tried with a non-PDF (rejected before
 * any upload) and closed with "Upload later".
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

describe('XVI-FC Grant | MoHUA — OM Generation History', () => {
  beforeEach(() => {
    cy.intercept('GET', new RegExp(`/mohua/om/history/${HEX}/1$`)).as('omHistory');
    visitWorkspacePage('om-history');
    cy.wait('@omHistory').its('response.body.data').then((d: any) => cy.wrap(Array.isArray(d) ? d : (d.items ?? d.oms ?? [])).as('oms'));
  });

  it('lists every issued OM with its status', () => {
    cy.contains('h1', 'OM Generation History').should('be.visible');
    cy.get('@oms').then((oms: any) => {
      if (!oms.length) {
        cy.contains('No OM has been issued yet.').should('be.visible');
        return;
      }
      cy.get('table tbody tr').should('have.length', oms.length);
      oms.forEach((om: any) => {
        cy.contains('tr', om.refNo).within(() => {
          cy.get('.cs-badge').first().should('contain.text', om.status === 'SIGNED_UPLOADED' ? 'Signed' : 'Issued');
          cy.contains('.cs-badge', 'Pending').should('exist'); // DoE status
          cy.contains(`${om.ulbCount} cities`).should('exist');
          if (om.signedFile) cy.contains('a', 'View PDF').should('have.attr', 'href').and('include', 'file/download');
        });
      });
    });
  });

  it('downloads an OM with its annexures', function () {
    cy.get('@oms').then((oms: any) => {
      if (!oms.length) this.skip();
      cy.intercept('GET', new RegExp(`/mohua/om/${HEX}/pdf$`)).as('omPdf');
      cy.get(`button[aria-label="Download ${oms[0].refNo} with its annexures as PDF"]`).click();
      cy.wait('@omPdf').its('response.statusCode').should('eq', 200);
    });
  });

  it('the signed-OM upload rejects a non-PDF before uploading (Upload later)', function () {
    cy.get('@oms').then((oms: any) => {
      if (!oms.length) this.skip();
      cy.contains('tr', oms[0].refNo).contains('button', /Upload signed OM|Replace/).click();
      cy.contains(`Upload the signed OM — ${oms[0].refNo}`).should('be.visible');
      cy.contains('Accepted format: PDF only · Max 5 MB').should('be.visible');
      cy.get('mat-dialog-container input[type="file"]').selectFile('cypress/fixtures/invalid-test-file.txt', { force: true });
      cy.get('.swal2-html-container').should('contain.text', 'Allowed file extensions');
      cy.get('.swal2-confirm').click();
      cy.contains('button', 'Upload Signed OM').should('be.disabled');
      cy.contains('button', 'Upload later').click();
      cy.contains(`Upload the signed OM — ${oms[0].refNo}`).should('not.exist');
    });
  });
});
