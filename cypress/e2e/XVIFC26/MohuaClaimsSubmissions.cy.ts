/**
 * XVI-FC Grant Portal — MoHUA "Claims & Submissions" (Grant Management).
 * URLs: /fc/xvifc/{yearId}/claims-submission[/{stateId}[/letter/{id}]]
 *
 * Built from the cityfinance-ng-ui-v2 / cf-nest-api-v2 `staging` branches
 * (mohua-module) and checked against staging.
 *
 * Read-only: every write is blocked and the afterEach fails the test if one
 * is attempted. Expected values come from the live API responses, so the spec
 * holds whatever data exists on staging.
 *
 * Review dialogs (Approve, Return, per-ULB return) are opened, validated and
 * CANCELLED — and only when a letter is actually awaiting review (status 15).
 * "Clear" on a marked ULB is never clicked (it saves with no dialog).
 */
import { blockWrites, loginAsMohua, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
// don't collide with other specs.

const HEX = '[a-f0-9]{24}';
const UI_STATUS: Record<number, string> = {
  15: 'Under Review by MoHUA', 16: 'Returned for Correction', 5: 'Verified', 6: 'Returned by MoHUA', 7: 'Acknowledged by MoHUA',
};

let blockedWrites: string[] = [];

beforeEach(() => {
  loginAsMohua();
  blockedWrites = blockWrites();
});

afterEach(() => {
  expect(blockedWrites, 'writes attempted by a read-only test').to.be.empty;
});

function openClaimsList() {
  cy.intercept('GET', new RegExp(`/mohua/claim-letters/${HEX}/1$`)).as('claimStates');
  visitWorkspacePage('claims-submission');
  cy.wait('@claimStates').its('response.body.data').as('claimsData');
}

/** Opens the first state with a received claim, then its first claim letter. */
function openFirstClaimLetter(ctx: Mocha.Context) {
  openClaimsList();
  cy.get('@claimsData').then((d: any) => {
    const state = d.states.find((s: any) => s.firstClaimStatus === 'RECEIVED');
    if (!state) ctx.skip();
    cy.intercept('GET', new RegExp(`/mohua/claim-letters/state/${HEX}/${HEX}/1$`)).as('stateLetters');
    cy.contains('table.cs-table tr', state.name).contains('a', 'View claims').click();
    cy.wait('@stateLetters').its('response.body.data').then((sd: any) => {
      if (!sd.claimLetters.length) ctx.skip();
      cy.wrap(sd.claimLetters[0]).as('letterSummary');
    });
  });
  cy.intercept('GET', new RegExp(`/mohua/claim-letters/letter/${HEX}$`)).as('letter');
  cy.intercept('GET', new RegExp(`/mohua/claim-letters/letter/${HEX}/ulbs`)).as('letterUlbs');
  cy.get('table.cs-table tbody tr').first().contains('a', 'View').click();
  cy.wait('@letter').its('response.body.data').as('letterData');
  cy.wait('@letterUlbs').its('response.body.data').as('ulbsData');
}

describe('XVI-FC Grant | MoHUA — Claim Letters by state', () => {
  beforeEach(() => openClaimsList());

  it('shows the heading and one row per state', () => {
    cy.contains('h1.cs-title', 'Claim Letters — Installment 1').should('be.visible');
    cy.contains('Claim letter status by state for the first installment of Basic Grants.').should('be.visible');
    cy.get('@claimsData').then((d: any) => {
      cy.get('table.cs-table tbody tr').should('have.length', d.states.length);
    });
  });

  it("shows each state's first-claim status with the matching action", () => {
    cy.get('@claimsData').then((d: any) => {
      d.states.slice(0, 8).forEach((s: any) => {
        cy.contains('table.cs-table tbody tr', s.name).within(() => {
          if (s.firstClaimStatus === 'RECEIVED') {
            cy.get('.cs-badge').invoke('text').invoke('trim').should('eq', 'Received');
            cy.contains('a', 'View claims').should('be.visible');
          } else {
            cy.get('.cs-badge').invoke('text').invoke('trim').should('eq', 'Pending');
            cy.contains('button', 'Track').should('have.attr', 'aria-disabled', 'true');
          }
        });
      });
    });
  });

  it('lists states that have claimed before the rest', () => {
    cy.get('@claimsData').then((d: any) => {
      const statuses = d.states.map((s: any) => s.firstClaimStatus);
      const firstPending = statuses.indexOf('PENDING');
      if (firstPending >= 0) expect(statuses.slice(firstPending), 'no RECEIVED after a PENDING').not.to.include('RECEIVED');
    });
  });
});

describe("XVI-FC Grant | MoHUA — A state's claim letters", () => {
  it('lists the claim letters of a state that has claimed', function () {
    openClaimsList();
    cy.get('@claimsData').then((d: any) => {
      const state = d.states.find((s: any) => s.firstClaimStatus === 'RECEIVED');
      if (!state) this.skip();
      cy.intercept('GET', new RegExp(`/mohua/claim-letters/state/${HEX}/${HEX}/1$`)).as('stateLetters');
      cy.contains('table.cs-table tr', state.name).contains('a', 'View claims').click();
      cy.wait('@stateLetters').its('response.body.data').then((sd: any) => {
        cy.contains('h1.cs-title', `${sd.state.name} — Claim Letters`).should('be.visible');
        cy.get('table.cs-table tbody tr').should('have.length', sd.claimLetters.length);
        sd.claimLetters.forEach((l: any) => {
          cy.contains('table.cs-table tbody tr', l.number).within(() => {
            cy.get('.cs-badge').should('contain.text', UI_STATUS[l.status] ?? l.statusLabel);
            cy.contains('a', 'View').should('be.visible');
          });
        });
        cy.get('p.cl-band').should('contain.text', `${sd.summary.claimedUlbs} ULBs claimed`);
      });
      cy.contains('a.cs-back', 'Back to Claim Letters').click();
      cy.location('pathname').should('match', /\/claims-submission$/);
    });
  });

  it('shows the empty state for a state with no claim letters', function () {
    openClaimsList();
    cy.get('@claimsData').then((d: any) => {
      const pending = d.states.find((s: any) => s.firstClaimStatus !== 'RECEIVED');
      if (!pending) this.skip();
      visitWorkspacePage(`claims-submission/${pending.stateId}`);
      cy.contains('No claim letters have been submitted for this state yet.').should('be.visible');
    });
  });
});

undefined
describe('XVI-FC Grant | MoHUA — Claim letter review page', () => {
  beforeEach(function () {
    openFirstClaimLetter(this);
  });

  it('shows the letter, its document and summary tiles', () => {
    cy.get('@letterData').then((l: any) => {
      cy.contains('h1.cs-title', `${l.number} — ${l.state.name}`).should('be.visible');
      cy.contains('ULB-level eligibility review for this claim letter.').should('be.visible');
      if (l.signedClaimFile) {
        cy.get('.cl-doc__name').should('contain.text', l.signedClaimFile.name);
        cy.get('section.cl-doc').contains('a', 'View PDF')
          .should('have.attr', 'target', '_blank')
          .and('have.attr', 'href').and('include', 'file/download');
      } else {
        cy.get('.cl-doc__name').should('contain.text', 'No signed claim letter attached');
      }
      ['Claim amount received', 'Total cities', 'Exemptions applied']
        .forEach((t) => cy.contains('.cl-tile__label', t).should('be.visible'));
      cy.contains('.cl-tile', 'Total cities').should('contain.text', String(l.summary.totalCities));
    });
  });

  it('lists the ULBs with their eligibility', () => {
    cy.get('@ulbsData').then((u: any) => {
      cy.get('table tbody tr .cl-ulb-link').should('have.length', u.items.length);
      u.items.slice(0, 5).forEach((item: any) => {
        cy.contains('tr', item.name).find('.cs-badge')
          .should('contain.text', item.ulbStatus === 'ELIGIBLE' ? 'Eligible' : 'Eligible via exemption');
      });
    });
  });

  it('searches ULBs by census code or name on the server', () => {
    cy.get('@ulbsData').then((u: any) => {
      const first = u.items[0];
      const term = first.censusCode || first.name;
      cy.get('#cl-ulb-search').type(String(term));
      cy.wait('@letterUlbs').its('request.url').should('include', `search=${encodeURIComponent(String(term)).replace(/%20/g, '+')}`.split('+')[0]);
      cy.get('table tbody tr .cl-ulb-link').should('have.length.at.least', 1).first().should('contain.text', first.name);
      cy.get('#cl-ulb-search').clear().type('zzz-no-such-ulb');
      cy.contains('No ULBs match.').should('be.visible');
    });
  });

  it('opens a ULB from the letter with a link back to it', () => {
    cy.get('@ulbsData').then((u: any) => {
      cy.contains('a.cl-ulb-link', u.items[0].name).click();
      cy.location('pathname').should('match', new RegExp(`/review-state-submissions/${HEX}/ulb/${HEX}$`));
      cy.location('search').should('include', 'claimLetter=');
    });
  });

  it('only offers Approve / Return while the letter awaits review', () => {
    cy.get('@letterData').then((l: any) => {
      if (l.status !== 15) {
        cy.get('.cl-actions').should('not.exist');
        cy.get('th.cl-decide').should('not.exist');
        return;
      }
      cy.contains('.cl-actions button', 'Return for correction').should('be.visible');
      cy.contains('.cl-actions button', 'Approve').should(l.returnedUlbCount > 0 ? 'be.disabled' : 'be.enabled');
      cy.get('th.cl-decide').should('exist');
    });
  });

  it('Approve asks for confirmation (cancelled)', function () {
    cy.get('@letterData').then((l: any) => {
      if (l.status !== 15 || l.returnedUlbCount > 0) this.skip();
      cy.contains('.cl-actions button', 'Approve').click();
      cy.contains('.confirm-dialog-title', 'Approve this claim letter?').should('be.visible');
      cy.contains(`Approve ${l.number} for ${l.summary.totalCities} ULB`).should('be.visible');
      cy.contains('button', 'Cancel').click();
      cy.get('.confirm-dialog-title').should('not.exist');
    });
  });

  it('Return for correction needs a reason before it can be confirmed (cancelled)', function () {
    cy.get('@letterData').then((l: any) => {
      if (l.status !== 15) this.skip();
      cy.contains('.cl-actions button', 'Return for correction').click();
      cy.contains('Return this claim letter for correction?').should('be.visible');
      ['Claim Letter', 'SFC Status', 'Grant Transfer Certificate']
        .forEach((t) => cy.contains('label.rcl-option', t).should('be.visible'));
      cy.get('#rcl-state-remark').should('have.attr', 'maxlength', '1000');
      if (!l.returnedUlbCount) {
        cy.get('button.rcl-confirm').should('be.disabled');
        cy.contains('p.rcl-hint', 'No ULB is marked returned: tick a State item to return the letter.').should('be.visible');
      }
      cy.contains('label.rcl-option', 'SFC Status').find('input[type="checkbox"]').check({ force: true });
      cy.get('button.rcl-confirm').should('be.enabled');
      cy.get('p.rcl-outcome').should('contain.text', 'SFC Status');
      cy.contains('button', 'Cancel').click();
      cy.contains('Return this claim letter for correction?').should('not.exist');
    });
  });

  it('marking one ULB for return needs a form ticked (cancelled)', function () {
    cy.get('@letterData').then((l: any) => {
      if (l.status !== 15) this.skip();
    });
    cy.get('@ulbsData').then((u: any) => {
      const plain = u.items.find((i: any) => !i.exemptions?.length && i.reviewStatus !== 'RETURNED');
      if (!plain) this.skip();
      cy.contains('tr', plain.name).find('button.cl-icon-btn--return').click();
      cy.contains(`Return ${plain.name} for correction?`).should('be.visible');
      cy.contains('button.rcl-confirm', 'Mark for Return').should('be.disabled');
      cy.contains('label.rcl-option', 'Audited Statements').find('input[type="checkbox"]').check({ force: true });
      cy.contains('button.rcl-confirm', 'Mark for Return').should('be.enabled');
      cy.contains('button', 'Cancel').click();
      cy.contains(`Return ${plain.name} for correction?`).should('not.exist');
    });
  });
});
