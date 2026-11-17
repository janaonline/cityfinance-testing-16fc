/**
 * XVI-FC Grant Portal — ULB "Service Level Benchmarks" (SLB) form.
 * Real, one-way mutations of the shared staging ULB 100002 account.
 *
 * Deliberately kept OUT of the default spec pattern (see
 * `excludeSpecPattern` in cypress.config.ts / cypress.config.ts.example) so
 * neither CI nor a plain local `cypress run` ever executes this file by
 * accident. Run it only by explicitly targeting this file, e.g.:
 *   npx cypress run --spec "cypress/e2e/XVIFC26/ServiceLevelBenchmarksMutating.cy.ts"
 * ideally against a disposable ULB rather than the shared 100002 account.
 *
 * "Save as Draft" is confirmed-safe-to-repeat live behavior (opens a
 * confirmation dialog, shows a success toast, form stays editable
 * afterward). "Submit to State DMA" stays `it.skip`'d even here: it's a
 * further, unverified one-way step this task never confirmed running for
 * real — remove `.skip` only once you've deliberately decided to find out
 * what it does, ideally on a disposable ULB.
 */

import { loginAsUlb, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
           // don't collide with same-named ones in other spec files.


function openSlbForm() {
  visitWorkspacePage('slb');
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

describe("XVI-FC Grant | ULB — SLB full form + Save as Draft (mutates shared ULB state)", () => {
  beforeEach(() => {
    loginAsUlb();
    openSlbForm();
  });

  it("fills all 28 indicators + declaration + document, confirms, and saves as draft", () => {
    ALL_INDICATOR_KEYS.forEach((key) => {
      actualField(key).clear().type("10");
      targetField(key).clear().type("10");
    });

    cy.get('[data-cy="declarantName-test"]').clear().type("Test Declarant");
    cy.get('[data-cy="declarantDesignation-test"]').clear().type("Municipal Engineer");
    cy.get('[data-cy="supportingDocumentFile-file-input-test"]').selectFile(
      "cypress/fixtures/valid-test-file.pdf",
      { force: true }
    );
    cy.get('[data-cy="checkboxConfirmation-test"]').click();

    cy.get('[data-cy="slb-submit-test"]').click();

    // Confirmed live: Save as Draft opens a confirmation dialog first.
    cy.contains("Save as draft?").should("be.visible");
    cy.contains(
      "Your progress will be saved. You can return to complete and submit this form later."
    ).should("be.visible");
    cy.contains("button", "Yes, save draft").click();

    cy.contains("Draft saved successfully.").should("be.visible");
    cy.get('span.status-pill').should("contain.text", "In Progress");
  });
});

describe("XVI-FC Grant | ULB — SLB Actual vs Target: full-form validation on Save as Draft (mutates shared ULB state)", () => {
  beforeEach(() => {
    loginAsUlb();
    openSlbForm();
  });

  // Proves the direction-aware actual-vs-target rule (see
  // SLBActualTargetDirection.cy.ts for the field-level, non-mutating
  // coverage of this rule) is also enforced by the full-form validation
  // pass that runs on "Save as Draft", not just on blur.
  it("re-validates a higher-is-better indicator (#1) on Save as Draft and blocks the save", () => {
    actualField("perCapitaWaterSupply").clear().type("20");
    targetField("perCapitaWaterSupply").clear().type("10");

    cy.get('[data-cy="slb-submit-test"]').click();

    cy.contains("Please correct the errors in the form before saving as draft.").should(
      "be.visible"
    );
    cy.contains("Actual value cannot exceed the target value.").should("be.visible");

    // Restore, since this describe block's other tests share the same
    // account and the next full-form save should not be blocked by this.
    actualField("perCapitaWaterSupply").clear().type("10");
    targetField("perCapitaWaterSupply").clear().type("10");
  });

  it("does NOT flag #7 NRW on a full-form Save as Draft pass when actual is above target", () => {
    actualField("nonRevenueWater").clear().type("20");
    targetField("nonRevenueWater").clear().type("10");

    cy.get('[data-cy="slb-submit-test"]').click();

    // Other required fields may still block the save at this point —
    // that's expected and not what this test is checking; it only
    // confirms NRW itself was never flagged as out of order.
    cy.get('[data-cy="nonRevenueWater_actual-test"]')
      .parents("tr")
      .within(() => {
        cy.contains("cannot exceed").should("not.exist");
      });

    actualField("nonRevenueWater").clear().type("10"); // restore
  });
});

describe("XVI-FC Grant | ULB — SLB final submission to State DMA (mutates shared ULB state — skipped by default)", () => {
  beforeEach(() => {
    loginAsUlb();
    openSlbForm();
  });

  // Not independently verified live — a final submission is a further
  // one-way step beyond Save as Draft, deliberately not exercised this
  // session. Fill in the real success-state assertions once run manually
  // against a disposable ULB before removing `.skip`.
  it.skip("submits a fully valid SLB form to State DMA", () => {
    ALL_INDICATOR_KEYS.forEach((key) => {
      actualField(key).clear().type("10");
      targetField(key).clear().type("10");
    });
    cy.get('[data-cy="declarantName-test"]').clear().type("Test Declarant");
    cy.get('[data-cy="declarantDesignation-test"]').clear().type("Municipal Engineer");
    cy.get('[data-cy="supportingDocumentFile-file-input-test"]').selectFile(
      "cypress/fixtures/valid-test-file.pdf",
      { force: true }
    );
    cy.get('[data-cy="checkboxConfirmation-test"]').click();
    cy.get('[data-cy="slb-final-submit-test"]').click();
    // TODO once run manually: what does success look like, and can the
    // form still be edited afterward?
  });
});
