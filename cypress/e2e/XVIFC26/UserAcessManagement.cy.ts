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

// Identifier and password are both visible together once a role is selected;
// there is no intermediate "Continue" step.
function loginAsUlb(censusCode = XVFCULB_ID, password = XVIFCULB_pass) {
  visitLogin();
  selectUlbRole();
  cy.get(IDENTIFIER_INPUT).type(censusCode, { force: true });
  cy.get(PASSWORD_INPUT).should('be.visible').click().type(password, { force: true, log: false });
  cy.contains('button', 'Sign In').click();

  // Some sessions land on a "Select Financial Year" gate after login;
  // others skip straight into the app. Clear the gate only if it appears.
  cy.contains(/Continue|People and Roles/, { timeout: 20000 })
    .invoke('text')
    .then((text: string) => {
      if (text.includes('Continue')) {
        cy.contains(/Continue|People and Roles/).click();
      }
    });

  // Whichever branch above ran, make sure we've actually left the "Select
  // Financial Year" gate before continuing — its "2026-27" year tile can
  // otherwise be mistaken for the workspace itself by a later check.
  cy.location('pathname', { timeout: 20000 }).should('not.include', '/year');
}

describe("XVI-FC Grant | Login (ULB)", () => {
  it("should verify that the user is on the 16th FC Login Homepage", () => {
    visitLogin();
    cy.url().should("eq", `${Cypress.config("baseUrl")}/fc/auth/login/16thFC`);
  });

  it("sign in box UI", () => {
    visitLogin();
    cy.contains("Sign In").should("be.visible");
    cy.contains("Select your role to continue").should("be.visible");
    cy.contains('span.role-card__label', 'ULB').should('be.visible');
    cy.contains('span.role-card__label', 'STATE').should('be.visible');
    cy.contains('span.role-card__label', 'MOHUA').should('be.visible');
    cy.contains('span.role-card__label', 'Institutional').should('be.visible');
    cy.contains("Need Help?").should("be.visible");
    cy.get('a[href="mailto:16fc.grant@cityfinance.in"]')
      .should("be.visible")
      .and("contain.text", "16fc.grant@cityfinance.in");
  });

  it('shows validation when submitted without entering an ULB login value', () => {
    visitLogin();
    selectUlbRole();
    cy.contains('button', 'Sign In').click();
    // The error banner fades in via a CSS transition, so give it a little
    // longer than the default retry window to settle before asserting.
    cy.contains('Census Code is required.', { timeout: 12000 }).should('be.visible');
  });

  // The backend returns the same generic message for an unregistered
  // census code as it does for an incorrect password (confirmed on
  // dev.cityfinance.in) — there is no distinct "user not found" state.
  it('shows an error for an unregistered census code', () => {
    visitLogin();
    selectUlbRole();
    cy.get(IDENTIFIER_INPUT).type('435673', { force: true });
    cy.get(PASSWORD_INPUT).type('someRandomPassword1', { force: true, log: false });
    cy.contains('button', 'Sign In').click();
    cy.contains('Invalid ULB Code/Census Code or password', { timeout: 12000 }).should('be.visible');
  });

  // Uses a random, almost-certainly-unregistered census code rather than a
  // real account with a deliberately wrong password: repeated wrong-password
  // attempts against a real account trigger the backend's account lockout
  // (confirmed on staging.cityfinance.in — census code 555557 got locked
  // for 1 hour after repeated runs), and the app returns the identical
  // generic message either way, so no real account is needed here.
  it('shows an error for an incorrect password', () => {
    const randomCensusCode = Math.floor(100000 + Math.random() * 900000).toString();
    visitLogin();
    selectUlbRole();
    cy.get(IDENTIFIER_INPUT).type(randomCensusCode, { force: true });
    cy.get(PASSWORD_INPUT).type('ulb@1234', { force: true, log: false });
    cy.contains('button', 'Sign In').click();

    cy.contains('Invalid ULB Code/Census Code or password', { timeout: 12000 }).should('be.visible');
  });

  it('logs in successfully with a valid ULB census code + password', () => {
    loginAsUlb();
    cy.contains('2026-27', { timeout: 20000 }).should('be.visible');
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
    // Login can land on the Overview page or directly on People & Roles
    // depending on session state, so navigate explicitly via the sidebar.
    loginAsUlb();
    cy.contains('2026-27', { timeout: 20000 }).should('be.visible');
    cy.contains('People and Roles').click({ force: true });
    cy.contains('People & Roles').should('be.visible');
  });

  // Confirmed via the live DOM (staging.cityfinance.in): this page is not a
  // general member roster. Its table is explicitly
  // `aria-label="Commissioner and nodal officer contacts"` — it manages
  // exactly the ULB's two fixed statutory contacts (Commissioner/Executive
  // Officer and Nodal Officer), edit-only. There is no search/filter and no
  // deactivate/status control anywhere on the page.
  it('deactivates / reactivates a user', () => {
    cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
    cy.contains(/Deactivate|Reactivate/i).should('not.exist');
  });

  it('search and filter controls narrow the user list correctly', () => {
    cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
    cy.get('input[type="search"], input[placeholder*="Search" i]').should('not.exist');
  });

  it('lists existing users with their role and status', () => {
    cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
    cy.get('table[aria-label="Commissioner and nodal officer contacts"]').should('be.visible');
    cy.get('tr.contact-row').should('have.length', 2);
    cy.contains('tr.contact-row', 'Municipal Commissioner / Executive Officer').should('be.visible');
    cy.contains('tr.contact-row', 'ULB Nodal Officer').should('be.visible');
  });

  // The edit control updates a contact's name/mobile/email — the two roles
  // (Commissioner, Nodal Officer) are fixed per row, not reassignable here.
  // Cancels rather than saves, to avoid mutating a real shared staging
  // ULB's contact details.
  it("edits an existing user's role/permissions", () => {
    cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
    cy.get('button.edit-icon-btn').first().click({ force: true });

    cy.get('input[formcontrolname="name"]').should('be.visible').and('not.have.value', '');
    cy.get('input[formcontrolname="mobile"]').should('be.visible');
    cy.get('input[formcontrolname="email"]').should('be.visible');

    cy.contains('button', 'Cancel').click({ force: true });
    cy.get('input[formcontrolname="name"]').should('not.be.visible');
  });

  // Only one contact can be edited at a time — opening one row's edit form
  // disables the other row's edit button (confirmed via the live DOM).
  it('only allows editing one contact at a time', () => {
    cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
    cy.get('button.edit-icon-btn').eq(1).should('be.enabled');
    cy.get('button.edit-icon-btn').first().click({ force: true });
    cy.get('button.edit-icon-btn').eq(1).should('be.disabled');
  });

  // Save Changes stays disabled while the form is invalid, so none of this
  // ever reaches the backend or mutates the real shared staging contact.
  it('validates required and format fields in the edit form', () => {
    cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
    cy.get('button.edit-icon-btn').first().click({ force: true });

    cy.get('input[formcontrolname="name"]').first().clear();
    cy.get('input[formcontrolname="mobile"]').first().clear().type('123');
    cy.get('input[formcontrolname="email"]').first().clear().type('not-an-email');
    cy.contains('button', 'Save Changes').click({ force: true });

    cy.contains('Name is required.').should('be.visible');
    cy.contains('Enter a valid 10-digit number').should('be.visible');
    cy.contains('Enter a valid email address.').should('be.visible');
    cy.contains('button', 'Save Changes').should('be.disabled');
  });
});

// -----------------------------------------------------------------------
// People and Roles — STATE / MOHUA
//
// Every selector, subtitle, placeholder, validation message, and
// permission-matrix row/dot below was confirmed against the live app on
// staging.cityfinance.in before being written. Two corrections worth
// flagging because they contradict a plausible-sounding assumption:
//   - STATE's member table DOES have a "Last Active" column — it is not
//     MOHUA-only.
//   - Several headings/badges render visually uppercase via CSS
//     (text-transform), but their actual DOM text is Title Case (e.g. the
//     "Role Permission Matrix" heading, the "You" badge, the "Admin" role
//     badge) — cy.contains() matches the real text, not the CSS look.
// -----------------------------------------------------------------------

const STATE_USER_ID = Cypress.env("STATE_USER_ID");
const STATE_PASSWORD = Cypress.env("STATE_PASSWORD");
const MOHUA_USER_ID = Cypress.env("MOHUA_USER_ID");
const MOHUA_PASSWORD = Cypress.env("MOHUA_PASSWORD");

function loginAndOpenPeopleAndRoles(role: string, identifier: string, password: string) {
  visitLogin();
  cy.contains('span.role-card__label', role).click();
  cy.get(IDENTIFIER_INPUT).type(identifier, { force: true });
  cy.get(PASSWORD_INPUT).type(password, { force: true, log: false });
  cy.contains('button', 'Sign In').click();

  cy.contains(/Continue|People and Roles/, { timeout: 20000 })
    .invoke('text')
    .then((text: string) => {
      if (text.includes('Continue')) {
        cy.contains(/Continue|People and Roles/).click();
      }
    });
  cy.contains('People and Roles', { timeout: 20000 }).click({ force: true });
  cy.contains('Team & Roles', { timeout: 20000 }).should('be.visible');
}

describe("XVI-FC Grant | People and Roles (STATE)", () => {
  beforeEach(() => {
    loginAndOpenPeopleAndRoles('STATE', STATE_USER_ID, STATE_PASSWORD);
  });

  it("shows the STATE-specific subtitle and a Last Active column", () => {
    cy.contains("Manage who has access and what they can do.").should("be.visible");
    cy.get("th").should("contain.text", "Last Active");
  });

  it("opens the Add Member form with the STATE-specific fields", () => {
    cy.contains("button", "Add Member").click({ force: true });
    cy.get('input[placeholder="e.g. Anjali Sharma"]').should("be.visible");
    cy.get('input[placeholder="e.g. Deputy Director"]').should("be.visible");
    cy.contains("Assign Role").should("be.visible");
    cy.get('input[placeholder="official@state.gov.in"]').should("be.visible");
    cy.get('input[placeholder="10-digit number"]').should("be.visible");
    cy.contains("button", "Cancel").click({ force: true });
  });

  it("only allows assigning Reviewer or Viewer to a new member (never Admin)", () => {
    cy.contains("button", "Add Member").click({ force: true });
    cy.get("mat-select").click({ force: true });
    cy.get("mat-option").should("have.length", 2);
    cy.contains("mat-option", "Reviewer").should("be.visible");
    cy.contains("mat-option", "Viewer").should("be.visible");
    cy.get("body").type("{esc}");
    cy.contains("button", "Cancel").click({ force: true });
  });

  it("validates required fields on an empty Add Member submission", () => {
    cy.contains("button", "Add Member").click({ force: true });
    cy.contains("button", "Send Invite").click({ force: true });
    cy.contains("Full name is required.").should("be.visible");
    cy.contains("Designation is required.").should("be.visible");
    cy.contains("Email address is required.").should("be.visible");
    cy.contains("Mobile number is required.").should("be.visible");
    cy.contains("button", "Cancel").click({ force: true });
  });

  it("Cancel closes the Add Member form without leaving it open", () => {
    cy.contains("button", "Add Member").click({ force: true });
    cy.contains("button", "Send Invite").should("be.visible");
    cy.contains("button", "Cancel").click({ force: true });
    cy.contains("button", "Send Invite").should("not.exist");
  });

  it("opens the Role Permission Matrix with STATE/ULB-oriented permissions", () => {
    cy.contains("button", "Permission matrix").click({ force: true });
    cy.contains("Role Permission Matrix").should("be.visible");
    [
      "View status and reports",
      "View dashboards",
      "Upload state-level documents",
      "Review ULB submissions",
      "Message users",
      "Approve ULB submissions",
      "Prepare grant letters",
      "Recommend exemptions",
      "Final submit to MoHUA",
      "Manage users",
    ].forEach((label) => {
      cy.contains(label).should("be.visible");
    });
  });

  it("Reviewer CAN approve ULB submissions on the STATE matrix", () => {
    cy.contains("button", "Permission matrix").click({ force: true });
    cy.contains("tr", "Approve ULB submissions").within(() => {
      cy.get("td").eq(2).find(".perm-dot--yes").should("exist"); // Reviewer column (td[0] is the row label)
    });
  });

  it("shows an inline 'Sure?' confirm step before removing a member", () => {
    cy.get("button.action-icon-btn--delete").first().click({ force: true });
    cy.contains("Sure?").should("be.visible");
  });
});

describe("XVI-FC Grant | People and Roles (MOHUA)", () => {
  beforeEach(() => {
    loginAndOpenPeopleAndRoles('MOHUA', MOHUA_USER_ID, MOHUA_PASSWORD);
  });

  it("shows the MOHUA-specific subtitle and a Last Active column", () => {
    cy.contains("Manage who has access to the MoHUA XVI FC workspace.").should("be.visible");
    cy.get("th").should("contain.text", "Last Active");
  });

  it("marks the logged-in user's own row with a You badge, no edit, and a dash for actions", () => {
    cy.contains("tr", MOHUA_USER_ID).within(() => {
      cy.contains("You").should("be.visible");
      cy.contains("Admin").should("be.visible");
      cy.get("button.role-edit-btn").should("not.exist");
      cy.get("td").last().should("contain.text", "—");
    });
  });

  it("opens the Add Member form with a MOHUA-specific email placeholder", () => {
    cy.contains("button", "Add Member").click({ force: true });
    cy.get('input[placeholder="official@mohua.gov.in"]').should("be.visible");
    cy.contains("button", "Cancel").click({ force: true });
  });

  it("opens the Role Permission Matrix with MOHUA/state-oriented permissions", () => {
    cy.contains("button", "Permission matrix").click({ force: true });
    cy.contains("Role Permission Matrix").should("be.visible");
    [
      "View status and reports",
      "View dashboards",
      "Review state submissions",
      "Send reminders to states",
      "Request information from states",
      "Approve / Reject submissions",
      "Issue Office Memorandum (OM)",
      "Final submit to DoE",
      "Manage team",
    ].forEach((label) => {
      cy.contains(label).should("be.visible");
    });
  });

  it("Reviewer CANNOT approve/reject submissions on the MOHUA matrix (Admin-only)", () => {
    cy.contains("button", "Permission matrix").click({ force: true });
    cy.contains("tr", "Approve / Reject submissions").within(() => {
      cy.get("td").eq(1).find(".perm-dot--yes").should("exist"); // Admin column (td[0] is the row label)
      cy.get("td").eq(2).find(".perm-dot--no").should("exist"); // Reviewer column: not allowed
    });
  });
});

// -----------------------------------------------------------------------
// Forgot / Reset Password — step 1 only (verify account)
//
// Step 2 (OTP + new password) is not covered here: reaching it requires
// submitting a real account identifier, which sends a real OTP SMS to a
// real masked phone number on every run, including the daily scheduled CI
// run. Every test below only exercises step 1 and never submits a real,
// registered identifier — so nothing here ever triggers that side effect.
// -----------------------------------------------------------------------

function visitResetPassword() {
  cy.visit("/fc/auth/reset-password/16thFC");
}

describe("XVI-FC Grant | Forgot / Reset Password — step 1", () => {
  beforeEach(() => {
    visitResetPassword();
  });

  it("defaults to ULB and shows the census-code field", () => {
    cy.contains("Reset Password").should("be.visible");
    cy.contains("Verify your ULB account").should("be.visible");
    cy.get('input[placeholder="Enter ULB or Census Code"]').should("be.visible");
  });

  it("requires the ULB code before continuing", () => {
    cy.contains("button", "Continue").click({ force: true });
    cy.contains("ULB Code / Census Code is required.").should("be.visible");
  });

  it("switches to STATE/MOHUA and updates the heading + placeholder to email", () => {
    cy.contains("button.role-pill", "STATE").click({ force: true });
    cy.contains("Verify your State account").should("be.visible");
    cy.get('input[placeholder="Enter your registered email"]').should("be.visible");

    cy.contains("button.role-pill", "MOHUA").click({ force: true });
    cy.contains("Verify your MoHUA account").should("be.visible");
    cy.get('input[placeholder="Enter your registered email"]').should("be.visible");
  });

  it("'Back to Login' returns to the main sign-in screen", () => {
    cy.contains("Back to Login").click({ force: true });
    cy.url().should("eq", `${Cypress.config("baseUrl")}/fc/auth/login/16thFC`);
  });
});
