/**
 * XVI-FC Grant Portal — ULB "XVI-FC Bank Account (PFMS)" form.
 * URL: /fc/xvifc/{ulbId}/xvi-fc-bank-account
 *
 * Every selector, message, and behavior below was confirmed against the
 * live staging app (staging.cityfinance.in, census code 100002) before
 * being written — not assumed.
 *
 * Confirmed live:
 *   - Fields: [data-cy="ifscCode-test"], [data-cy="accountNumber-test"],
 *     [data-cy="confirmAccountNumber-test"].
 *   - The account number fields strip non-digit characters as you type
 *     (typing "12ab34cd56" leaves the field holding "123456").
 *   - A well-formed but non-existent IFSC ("ABCD0123456") shows a toast:
 *     "No bank details found for this IFSC code." A real IFSC
 *     (SBIN0001234) shows a bank-details panel with name/branch/address/
 *     MICR — this genuinely hits a live bank-lookup API, so the exact
 *     details are that specific branch's real data, not app copy.
 *   - The cancelled-cheque upload accepts .pdf/.jpg/.jpeg/.png, max 5 MB,
 *     and rejects other extensions and oversized files with distinct
 *     messages. "Submit to State DMA" is disabled by default.
 *
 * NOT covered here: actually clicking "Submit to State DMA" — a one-way
 * submission this task never verified running for real (no confirmation
 * dialog was found in the DOM the way SLB's "Save as Draft" has one, so
 * its exact effects are unknown). Left as a commented reference only, the
 * same convention used for SLB's final submission.
 */

export {}; // Makes this file its own module so top-level declarations
           // don't collide with same-named ones in other spec files.

const XVFCULB_ID = Cypress.env("XVFCULB_ID");
const XVIFCULB_pass = Cypress.env("XVIFCULB_pass");

const IDENTIFIER_INPUT = 'input[formcontrolname="identifier"]';
const PASSWORD_INPUT = 'input[formcontrolname="password"]';

function loginAsUlb(censusCode = XVFCULB_ID, password = XVIFCULB_pass) {
  cy.visit("/fc/auth/login/16thFC");
  cy.contains('span.role-card__label', 'ULB').click();
  cy.get(IDENTIFIER_INPUT).type(censusCode, { force: true });
  cy.get(PASSWORD_INPUT).should('be.visible').click().type(password, { force: true, log: false });
  cy.contains('button', 'Sign In').click();

  cy.contains(/Continue|People and Roles/, { timeout: 20000 })
    .invoke('text')
    .then((text: string) => {
      if (text.includes('Continue')) {
        cy.contains(/Continue|People and Roles/).click();
      }
    });
  cy.location('pathname', { timeout: 20000 }).should('not.include', '/year');
}

// Navigates directly via the workspace's own URL — consistent with the SLB
// spec's approach, which proved more reliable than clicking the sidebar link.
function openBankAccountForm() {
  cy.contains('2026-27', { timeout: 20000 }).should('be.visible');
  cy.url().then((currentUrl) => {
    const match = currentUrl.match(/^(.*\/fc\/xvifc\/[^/]+)\//);
    const workspaceBase = match ? match[1] : currentUrl.replace(/\/[^/]*$/, '');
    cy.visit(`${workspaceBase}/xvi-fc-bank-account`);
  });
  cy.contains('h1', 'XVI-FC Bank Account (PFMS)', { timeout: 20000 }).should('be.visible');
  cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
}

function ifscField() {
  return cy.get('[data-cy="ifscCode-test"]');
}
function accountField() {
  return cy.get('[data-cy="accountNumber-test"]');
}
function confirmAccountField() {
  return cy.get('[data-cy="confirmAccountNumber-test"]');
}

describe("XVI-FC Grant | ULB — PFMS Bank Account form structure", () => {
  beforeEach(() => {
    loginAsUlb();
    openBankAccountForm();
  });

  it("shows the IFSC, Account Number, and Confirm Account Number fields", () => {
    cy.contains('label', 'IFSC Code').should('be.visible');
    ifscField().should('be.visible').and('have.attr', 'placeholder', 'e.g. SBIN0001234');
    cy.contains('label', 'Account Number').should('be.visible');
    accountField().should('be.visible');
    cy.contains('label', 'Confirm Account Number').should('be.visible');
    confirmAccountField().should('be.visible');
  });

  it("shows the cancelled-cheque upload area and a disabled Submit button", () => {
    cy.contains('Proof of account linkage with PFMS').should('be.visible');
    cy.contains('Click to upload cancelled cheque').should('be.visible');
    cy.contains('PDF, JPG, or PNG').should('be.visible');
    cy.get('input[type="file"]').should('have.attr', 'accept', '.pdf,.jpg,.jpeg,.png');
    cy.contains('button', 'Submit to State DMA').should('be.disabled');
  });
});

describe("XVI-FC Grant | ULB — PFMS Bank Account field validation", () => {
  beforeEach(() => {
    loginAsUlb();
    openBankAccountForm();
  });

  it("marks IFSC and Account Number required once touched and left empty", () => {
    ifscField().click();
    accountField().click();
    confirmAccountField().click();
    cy.contains('IFSC code is required.').should('be.visible');
    cy.contains('Account number is required.').should('be.visible');
  });

  it("rejects a malformed IFSC code", () => {
    ifscField().type('BADCODE');
    accountField().click();
    cy.contains('Enter a valid Indian IFSC code.').should('be.visible');
  });

  it("shows 'No bank details found' for a well-formed but non-existent IFSC", () => {
    ifscField().type('ABCD0123456');
    cy.contains('No bank details found for this IFSC code.').should('be.visible');
  });

  // This hits a live bank-lookup API for a real branch (SBIN0001234), so
  // these are that branch's actual real-world details, not app copy.
  it("looks up and displays real bank/branch details for a valid IFSC", () => {
    ifscField().type('SBIN0001234');
    cy.contains('State Bank of India').should('be.visible');
    cy.contains('HAJIGANJ').should('be.visible');
    cy.contains('PATNA').should('be.visible');
    cy.contains('800002019').should('be.visible'); // MICR
  });

  it("strips non-digit characters from the account number as you type", () => {
    accountField().type('12ab34cd56');
    accountField().should('have.value', '123456');
  });

  it("requires a minimum of 9 digits in the account number", () => {
    accountField().type('123');
    confirmAccountField().click();
    cy.contains('Minimum 9 digits required.').should('be.visible');
  });

  it("requires the confirm field and flags a mismatch", () => {
    accountField().type('123456789012');
    confirmAccountField().click(); // touch it
    ifscField().click(); // blur it while still empty
    cy.contains('Please confirm the account number.').should('be.visible');

    confirmAccountField().type('999999999999');
    ifscField().click();
    cy.contains('Account numbers do not match.').should('be.visible');
  });
});

describe("XVI-FC Grant | ULB — PFMS cancelled-cheque upload", () => {
  beforeEach(() => {
    loginAsUlb();
    openBankAccountForm();
  });

  it("rejects a disallowed file extension", () => {
    cy.get('input[type="file"]').selectFile('cypress/fixtures/invalid-test-file.txt', { force: true });
    cy.contains('Only PDF, JPG, and PNG files are allowed.').should('be.visible');
  });

  it("rejects a file over 5 MB", () => {
    cy.get('input[type="file"]').selectFile('cypress/fixtures/oversized-test-file.pdf', { force: true });
    cy.contains('File size must not exceed 5 MB.').should('be.visible');
  });

  it("accepts a valid PDF and clears the required-document state", () => {
    cy.get('input[type="file"]').selectFile('cypress/fixtures/valid-test-file.pdf', { force: true });
    cy.contains('Upload a proof document.').should('not.exist');
  });
});

// ---------------------------------------------------------------------------
// NOT AUTOMATED — actually clicking "Submit to State DMA" is a further,
// one-way step this task never verified running for real. Unlike SLB's
// "Save as Draft", no confirmation dialog was found for this button in
// exploration, so its exact effect (redirect? inline success state? can it
// be edited afterward?) is unknown. Fill in and verify manually, ideally
// against a disposable ULB, before automating it:
//
// it("submits a valid PFMS bank account form to State DMA", () => {
//   cy.get('[data-cy="ifscCode-test"]').type('SBIN0001234');
//   cy.get('[data-cy="accountNumber-test"]').type('123456789012');
//   cy.get('[data-cy="confirmAccountNumber-test"]').type('123456789012');
//   cy.get('input[type="file"]').selectFile('cypress/fixtures/valid-test-file.pdf', { force: true });
//   cy.contains('button', 'Submit to State DMA').should('be.enabled').click();
//   // TODO once run manually: what does success look like?
// });
// ---------------------------------------------------------------------------
