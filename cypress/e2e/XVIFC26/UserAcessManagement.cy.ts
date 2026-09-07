import "cypress-file-upload";
require('cypress-xpath');

const XVFCULB_ID = Cypress.env("XVFCULB_ID");
const XVIFCULB_pass = Cypress.env("XVIFCULB_pass");

const IDENTIFIER_INPUT = 'input[formcontrolname="identifier"]';
const PASSWORD_INPUT = 'input[formcontrolname="password"]';

function visitLogin() {
  cy.visit("/fc/auth/login/16thFC");
}

function selectUlbRole() {
  cy.contains('span.role-card__label', 'ULB').click();
}

// Two-step sign-in: identifier + Continue reveals the password field, and the
// final submit control has no stable text/attribute of its own, so it's
// targeted by index among the touch-target spans on the page.
function loginAsUlb(censusCode = XVFCULB_ID, password = XVIFCULB_pass) {
  visitLogin();
  selectUlbRole();
  cy.get(IDENTIFIER_INPUT).type(censusCode, { force: true });
  cy.wait(10000);
  cy.contains('button', 'Continue').click();
  cy.wait(10000);

  cy.contains('Password is required.').should('be.visible');
  cy.get(PASSWORD_INPUT).should('be.visible').click().type(password, { force: true, log: false });
  cy.wait(10000);

  cy.get('span.mat-mdc-button-touch-target').eq(3).click({ force: true });
  cy.wait(40000);
}

describe("XVI-FC Grant | Login (ULB)", () => {
  it("should verify that the user is on the 16th FC Login Homepage", () => {
    visitLogin();
    cy.url().should("eq", `${Cypress.config("baseUrl")}/fc/auth/login/16thFC`);
  });

  it("sign in box UI", () => {
    visitLogin();
    cy.contains("Sign In").should("be.visible");
    cy.contains("Select your role, then enter your credentials below").should("be.visible");
    cy.contains('span.role-card__label', 'ULB').should('be.visible');
    cy.contains('span.role-card__label', 'State DMA').should('be.visible');
    cy.contains('span.role-card__label', 'MoHUA').should('be.visible');
    cy.contains('span.role-card__label', 'Institutional').should('be.visible');
    cy.get('input[formcontrolname="identifier"][placeholder="Mobile, email or census code"]').should("be.visible");
    cy.contains("button, a, span", "Continue").should("be.visible");
    cy.contains("Need Help?").should("be.visible");
    cy.get('a[href="mailto:16fcgrant@cityfinance.in"]')
      .should("be.visible")
      .and("have.text", "16fcgrant@cityfinance.in");
  });

  it('shows validation when submitted without entering an ULB login value', () => {
    visitLogin();
    selectUlbRole();
    cy.contains('button', 'Continue').click();
    cy.contains('.field-error', 'Mobile number, email or Census Code is required.')
      .should('be.visible');
  });

  it('shows an error for an unregistered census code', () => {
    visitLogin();
    selectUlbRole();
    cy.get(IDENTIFIER_INPUT).type('435673', { force: true });
    cy.contains('button', 'Continue').click();
    cy.contains('User not found. Please check your details.').should('be.visible');
  });

  it('shows an email-format hint when a valid email is entered', () => {
    visitLogin();
    selectUlbRole();
    cy.get(IDENTIFIER_INPUT).type('test@gmail.com', { force: true });
    cy.contains('Valid email address').should('be.visible');
  });

  it('shows an error for an incorrect password', () => {
    visitLogin();
    selectUlbRole();
    cy.get(IDENTIFIER_INPUT).type('555557', { force: true });
    cy.contains('button', 'Continue').click();
    cy.wait(10000);

    cy.contains('Password is required.').should('be.visible');
    cy.get(PASSWORD_INPUT).should('be.visible').click().type('ulb@1234', { force: true, log: false });
    cy.wait(10000);

    cy.get('span.mat-mdc-button-touch-target').eq(3).click({ force: true });

    cy.contains('Invalid ULB Code/Census Code or password').should('be.visible');
  });

  it('logs in successfully with a valid ULB census code + password', () => {
    loginAsUlb();
    cy.contains('2026-27').should('be.visible');

    cy.get('button.continue-btn').click();
    cy.wait(10000);
    cy.get('h2').should('be.visible');
  });

  // Same flow via a registered mobile number instead of a census code. Left
  // as reference until a known-good mobile + password pair is confirmed —
  // XVFCULB_ID/XVIFCULB_pass above are census-code credentials, not this.
  // it('logs in successfully with a valid ULB mobile number + password', () => {
  //   visitLogin();
  //   selectUlbRole();
  //   cy.get(IDENTIFIER_INPUT).type('9527003333', { force: true });
  //   cy.wait(10000);
  //   cy.contains('button', 'Continue').click();
  //   cy.wait(10000);
  //   cy.contains('Password is required.').should('be.visible');
  //   cy.get(PASSWORD_INPUT).click().type('ulb@123', { force: true, log: false });
  //   cy.wait(10000);
  //   cy.get('span.mat-mdc-button-touch-target').eq(3).click({ force: true });
  //   cy.wait(100000);
  //   cy.contains('2026-27').should('be.visible');
  // });
});

describe("XVI-FC Grant | User Access Management (ULB)", () => {
  beforeEach(() => {
    loginAsUlb();
    cy.contains('2026-27').should('be.visible');

    cy.get('button.continue-btn').click();
    cy.wait(10000);

    cy.contains('span.menu-label', 'unified view').click({ force: true });
    cy.contains('People & Roles').should('be.visible');
  });

  it('shows the Add Member action enabled', () => {
    cy.contains('span.mdc-button__label', 'Add Member')
      .should('be.visible')
      .closest('button')
      .should('be.enabled');
  });

  it('adds a new member with a role, name and mobile number', () => {
    cy.contains('span.mdc-button__label', 'Add Member')
      .closest('button')
      .click({ force: true });

    cy.get('#mat-select-8').click();
    cy.get('.mat-mdc-option').first().click();

    const randomName = `Test User ${Math.floor(Math.random() * 100000)}`;
    cy.get('input[formcontrolname="fullName"]').clear().type(randomName);
    cy.log(`Entered Name: ${randomName}`);

    const randomMobile = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    cy.get('input[name="addPhone"]').clear().type(randomMobile);
    cy.log(`Mobile Number: ${randomMobile}`);

    cy.contains('button', 'Add Member').click({ force: true });
  });

  // Pending: form validation, the user list, edit/deactivate controls, and
  // duplicate-detection all need their real selectors captured before these
  // can be written — inspect the Add Member form and user list DOM first.
  it('validates required fields on the Add Member form');
  it('lists existing users with their role and status');
  it("edits an existing user's role/permissions");
  it('deactivates / reactivates a user');
  it('prevents duplicate user creation (same census code / mobile)');
  it('search and filter controls narrow the user list correctly');
});
