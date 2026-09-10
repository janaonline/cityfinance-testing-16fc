/**
 * XVI-FC Grant Portal — ULB "Service Level Benchmarks" (SLB) form.
 * URL: /fc/xvifc/{ulbId}/slb
 *
 * Every selector, section name, validation message, and button label below
 * was confirmed against the live staging app (staging.cityfinance.in,
 * census code 100002) before being written — not assumed. Notably:
 *   - Section headings are Title Case in the DOM ("Water Supply", not
 *     "WATER SUPPLY") even though they render visually uppercase via CSS.
 *   - "Save as Draft" is `[data-cy="slb-submit-test"]`; the true one-way
 *     final action is a separate button, `[data-cy="slb-final-submit-test"]`
 *     labeled "Submit to State DMA".
 *
 * IMPORTANT — the shared staging ULB 100002 account's SLB status is
 * currently "In Progress" (all 28 indicators already saved as 10/10), not
 * "Not Started" — a real "Save as Draft" was run against it previously.
 * There is no "reset to Not Started" control in the UI, so tests here
 * assert the current real state rather than assuming a pristine one.
 *
 * NOT covered here: actually filling the form and clicking "Save as
 * Draft" or "Submit to State DMA" for real. Both are one-way mutations of
 * a shared account with no undo — see ServiceLevelBenchmarksMutating.cy.ts,
 * which is excluded from the default spec pattern (cypress.config.ts)
 * specifically so neither CI nor a plain local run ever triggers them.
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

  // Whichever branch above ran, make sure we've actually left the "Select
  // Financial Year" gate before continuing — its "2026-27" year tile can
  // otherwise be mistaken for the workspace itself by a later check.
  cy.location('pathname', { timeout: 20000 }).should('not.include', '/year');
}

// Navigates directly via the workspace's own URL rather than the sidebar
// link — the sidebar "Service Level Benchmarks" link didn't reliably
// register a click in testing, while a direct visit to /slb works
// consistently and isn't gated by any route guard (confirmed: SLB is not
// locked for this ULB).
function openSlbForm() {
  cy.contains('2026-27', { timeout: 20000 }).should('be.visible');
  cy.url().then((currentUrl) => {
    const match = currentUrl.match(/^(.*\/fc\/xvifc\/[^/]+)\//);
    const workspaceBase = match ? match[1] : currentUrl.replace(/\/[^/]*$/, '');
    cy.visit(`${workspaceBase}/slb`);
  });
  cy.contains('h1', 'Service Level Benchmarks', { timeout: 20000 }).should('be.visible');
  cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
}

/** Every SLB indicator's data-cy key, grouped by section, in on-page order. */
const SLB_SECTIONS: Record<string, string[]> = {
  "Water Supply": [
    "perCapitaWaterSupply",
    "waterMeteringExtent",
    "waterComplaintRedressal",
    "waterQuality",
    "waterCostRecovery",
    "waterSupplyCoverage",
    "nonRevenueWater",
    "waterSupplyContinuity",
    "waterChargeCollection",
  ],
  "Sewerage Management": [
    "wasteWaterTreatmentCapacity",
    "wasteWaterTreatmentQuality",
    "wasteWaterComplaintRedressal",
    "wasteWaterCollectionEfficiency",
    "toiletCoverage",
    "wasteWaterNetworkCoverage",
    "wasteWaterReuseExtent",
    "wasteWaterCostRecovery",
    "wasteWaterChargeCollection",
  ],
  "Solid Waste Management": [
    "swmCostRecovery",
    "swmComplaintRedressal",
    "swmChargeCollection",
    "mswCollectionEfficiency",
    "mswSegregationExtent",
    "mswRecoveryExtent",
    "mswScientificDisposal",
    "swmHouseholdCoverage",
  ],
  "Storm Water Drainage": ["stormWaterDrainageCoverage", "waterLoggingIncidence"],
};

const ALL_INDICATOR_KEYS = Object.values(SLB_SECTIONS).flat();

function actualField(key: string) {
  return cy.get(`[data-cy="${key}_actual-test"]`);
}
function targetField(key: string) {
  return cy.get(`[data-cy="${key}_target-test"]`);
}

describe("XVI-FC Grant | ULB — SLB form structure", () => {
  beforeEach(() => {
    loginAsUlb();
    openSlbForm();
  });

  it("shows all 4 sections in Title Case", () => {
    Object.keys(SLB_SECTIONS).forEach((section) => {
      cy.contains(section).scrollIntoView().should("be.visible");
    });
  });

  it("shows an actual and a target input for every one of the 28 indicators", () => {
    ALL_INDICATOR_KEYS.forEach((key) => {
      actualField(key).should("exist");
      targetField(key).should("exist");
    });
    expect(ALL_INDICATOR_KEYS).to.have.length(28);
  });

  // The shared ULB 100002 account was already moved to "In Progress" by a
  // prior real "Save as Draft" run (see file header) — there's no UI
  // control to reset it back to "Not Started".
  it("shows the current 'In Progress' status", () => {
    cy.get('span.status-pill').should('contain.text', 'In Progress');
  });

  it("shows the Self Declaration section with Name, Designation, document upload, and checkbox", () => {
    cy.contains("Self Declaration").scrollIntoView().should("be.visible");
    cy.get('[data-cy="declarantName-test"]').should("be.visible");
    cy.get('[data-cy="declarantDesignation-test"]').should("be.visible");
    cy.get('[data-cy="supportingDocumentFile-file-input-test"]').should("exist");
    cy.get('[data-cy="checkboxConfirmation-test"]').should("be.visible");
  });
});

describe("XVI-FC Grant | ULB — SLB field-level validation", () => {
  beforeEach(() => {
    loginAsUlb();
    openSlbForm();
  });

  // Every test below clears a field and types a new value, then checks the
  // validation message — it never clicks Save as Draft or Submit, so
  // nothing here is ever persisted regardless of the account's current
  // saved values.
  it("marks an indicator required once touched and left empty", () => {
    actualField("perCapitaWaterSupply").clear().click();
    actualField("waterMeteringExtent").click(); // move focus away (blur)
    cy.contains("This field is required.").scrollIntoView().should("be.visible");
    actualField("perCapitaWaterSupply").clear().type("10"); // restore
  });

  it("rejects a negative value", () => {
    actualField("perCapitaWaterSupply").clear().type("-5");
    cy.contains("Value cannot be negative.").should("be.visible");
    actualField("perCapitaWaterSupply").clear().type("10");
  });

  it("rejects a value over the stated max, with the correct unit in the message", () => {
    // lpcd field, max 999
    actualField("perCapitaWaterSupply").clear().type("1500");
    cy.contains("Value cannot exceed 999 lpcd.").should("be.visible");
    actualField("perCapitaWaterSupply").clear().type("10");

    // percentage field, max 100
    actualField("waterMeteringExtent").clear().type("150");
    cy.contains("Value cannot exceed 100%.").should("be.visible");
    actualField("waterMeteringExtent").clear().type("10");

    // Hours/day field, max 24
    actualField("waterSupplyContinuity").clear().type("30");
    cy.contains("Value cannot exceed 24 Hours/day.").should("be.visible");
    actualField("waterSupplyContinuity").clear().type("10");

    // Nos./Year field, max 9999
    actualField("waterLoggingIncidence").clear().type("10000");
    cy.contains("Value cannot exceed 9999 Nos./Year.").should("be.visible");
    actualField("waterLoggingIncidence").clear().type("10");
  });

  it("accepts a decimal value within range without error", () => {
    actualField("waterMeteringExtent").clear().type("45.5");
    actualField("waterMeteringExtent").should("have.value", "45.5");
    cy.contains("Value cannot exceed").should("not.exist");
    actualField("waterMeteringExtent").clear().type("10");
  });
});

describe("XVI-FC Grant | ULB — SLB supporting document upload", () => {
  beforeEach(() => {
    loginAsUlb();
    openSlbForm();
    cy.contains("Self Declaration").scrollIntoView();
  });

  it("rejects a disallowed file extension with a modal error", () => {
    cy.get('[data-cy="supportingDocumentFile-file-input-test"]').selectFile(
      "cypress/fixtures/invalid-test-file.txt",
      { force: true }
    );
    cy.contains("Allowed file extensions: pdf, jpg, jpeg, png").should("be.visible");
    cy.get('body').then(($b) => {
      if ($b.find('button:contains("OK")').length) {
        cy.contains('button', 'OK').click({ force: true });
      }
    });
  });

  it("accepts a valid PDF and shows it with a view control", () => {
    cy.get('[data-cy="supportingDocumentFile-file-input-test"]').selectFile(
      "cypress/fixtures/valid-test-file.pdf",
      { force: true }
    );
    cy.contains("valid-test-file.pdf").should("be.visible");
    cy.get('[data-cy="supportingDocumentFile-view-test"]').should("be.visible");
  });
});
