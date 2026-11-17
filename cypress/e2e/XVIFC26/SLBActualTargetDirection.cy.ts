/**
 * XVI-FC Grant Portal — ULB "Service Level Benchmarks" (SLB) form.
 * Direction-aware Actual-vs-Target validation.
 *
 * The SLB form used to block submission whenever an indicator's actual
 * value was above its target value — for every indicator, with no
 * exceptions. That rule is correct for a "higher is better" indicator
 * (e.g. water supply coverage), but wrong for a "lower is better"
 * indicator (e.g. incidence of water logging), where a target BELOW the
 * actual value is the correct, intended improvement, not an error.
 *
 * Confirmed rule on live staging (ULB 100002):
 *   Higher is better -> blocks with "Actual value cannot exceed the
 *     target value." when actual > target.
 *   Lower is better  -> blocks with "Target value cannot exceed the
 *     actual value." when target > actual.
 * ...applied to indicators #7 (Extent of non-revenue water / NRW,
 * `nonRevenueWater`) and #28 (Incidence of water logging,
 * `waterLoggingIncidence`), with every other indicator staying on the
 * default "higher is better" rule — confirmed per-indicator, not
 * per-section, via #27 (`stormWaterDrainageCoverage`), which sits in
 * #28's own "Storm Water Drainage" section but keeps the default rule.
 *
 * Equal actual/target values are valid under either rule.
 *
 * These tests are field-level only (clear/type + inline message check)
 * and never click "Save as Draft" or "Submit to State DMA" — both are
 * one-way mutations of the shared ULB 100002 account; the same
 * direction-aware rule re-validated via a full-form "Save as Draft"
 * pass lives in ServiceLevelBenchmarksMutating.cy.ts instead.
 */

import { loginAsUlb, visitWorkspacePage } from '../../support/xvifcSession';

export {}; // Makes this file its own module so top-level declarations
           // don't collide with same-named ones in other spec files.


function openSlbForm() {
  visitWorkspacePage('slb');
  cy.contains('h1', 'Service Level Benchmarks', { timeout: 20000 }).should('be.visible');
  cy.get('.loading-block--light', { timeout: 15000 }).should('not.exist');
}

function actualField(key: string) {
  return cy.get(`[data-cy="${key}_actual-test"]`);
}
function targetField(key: string) {
  return cy.get(`[data-cy="${key}_target-test"]`);
}

const ACTUAL_EXCEEDS_TARGET = "Actual value cannot exceed the target value.";
const TARGET_EXCEEDS_ACTUAL = "Target value cannot exceed the actual value.";

describe("XVI-FC Grant | ULB — SLB Actual vs Target: lower-is-better indicators (#7 NRW, #28 water logging)", () => {
  beforeEach(() => {
    loginAsUlb();
    openSlbForm();
  });

  it("#7 NRW: does NOT block when actual is above target (a lower target is the correct improvement)", () => {
    actualField("nonRevenueWater").clear().type("20");
    targetField("nonRevenueWater").clear().type("10");
    cy.contains("cannot exceed").should("not.exist");
    targetField("nonRevenueWater").clear().type("10"); // restore
  });

  it("#7 NRW: blocks and names the TARGET when target is above actual", () => {
    actualField("nonRevenueWater").clear().type("20");
    targetField("nonRevenueWater").clear().type("30");
    cy.contains(TARGET_EXCEEDS_ACTUAL).should("be.visible");
    targetField("nonRevenueWater").clear().type("10"); // restore
  });

  it("#7 NRW: equal actual and target is valid", () => {
    actualField("nonRevenueWater").clear().type("15");
    targetField("nonRevenueWater").clear().type("15");
    cy.contains("cannot exceed").should("not.exist");
    targetField("nonRevenueWater").clear().type("10"); // restore
  });

  it("#28 water logging: does NOT block when actual is above target", () => {
    actualField("waterLoggingIncidence").clear().type("50");
    targetField("waterLoggingIncidence").clear().type("10");
    cy.contains("cannot exceed").should("not.exist");
    actualField("waterLoggingIncidence").clear().type("10"); // restore
    targetField("waterLoggingIncidence").clear().type("10");
  });

  it("#28 water logging: blocks and names the TARGET when target is above actual", () => {
    actualField("waterLoggingIncidence").clear().type("50");
    targetField("waterLoggingIncidence").clear().type("60");
    cy.contains(TARGET_EXCEEDS_ACTUAL).should("be.visible");
    actualField("waterLoggingIncidence").clear().type("10"); // restore
    targetField("waterLoggingIncidence").clear().type("10");
  });

  it("#28 water logging: equal actual and target is valid", () => {
    actualField("waterLoggingIncidence").clear().type("50");
    targetField("waterLoggingIncidence").clear().type("50");
    cy.contains("cannot exceed").should("not.exist");
    actualField("waterLoggingIncidence").clear().type("10"); // restore
    targetField("waterLoggingIncidence").clear().type("10");
  });
});

describe("XVI-FC Grant | ULB — SLB Actual vs Target: default higher-is-better indicators are unaffected", () => {
  beforeEach(() => {
    loginAsUlb();
    openSlbForm();
  });

  it("#1 Per capita supply of water: blocks and names the ACTUAL when actual is above target (unchanged default rule)", () => {
    actualField("perCapitaWaterSupply").clear().type("20");
    targetField("perCapitaWaterSupply").clear().type("10");
    cy.contains(ACTUAL_EXCEEDS_TARGET).should("be.visible");
    actualField("perCapitaWaterSupply").clear().type("10"); // restore
  });

  it("#27 Coverage of storm water drainage network: same default rule as #1, proving the exception is per-indicator, not per-section (#27 sits in the same Storm Water Drainage section as #28)", () => {
    actualField("stormWaterDrainageCoverage").clear().type("20");
    targetField("stormWaterDrainageCoverage").clear().type("10");
    cy.contains(ACTUAL_EXCEEDS_TARGET).should("be.visible");
    actualField("stormWaterDrainageCoverage").clear().type("10"); // restore
  });

  it("higher-is-better indicators are NOT blocked when target is above actual (the normal, aiming-higher case)", () => {
    actualField("perCapitaWaterSupply").clear().type("10");
    targetField("perCapitaWaterSupply").clear().type("20");
    cy.contains("cannot exceed").should("not.exist");
    targetField("perCapitaWaterSupply").clear().type("10"); // restore
  });
});
