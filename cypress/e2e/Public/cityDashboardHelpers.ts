/**
 * Shared helpers for the PublicCity*.cy.ts specs (public city dashboard).
 * Not a spec (no .cy.ts suffix). Built from cf-ui-ssr-v3 staging sources.
 */
// Staging is slow on first SSR loads; these apply only to specs importing this file.
Cypress.config('requestTimeout', 30000);
Cypress.config('defaultCommandTimeout', 15000);

export const API = 'https://staging.cityfinance.in/api/v1';
export const SLUG = 'pune'; // Rich data on staging: 7 ledger years, bonds, credit ratings, SLB, MR.
export const SAME_STATE_CITY = 'Nagpur'; // Another Maharashtra ULB for city switching / compare.
export const EMPTY_SLUG = 'atpadi-nagarpanchayat'; // No ledger, SLB, borrowing or MR data on staging.

// ---------- helpers ----------

export type InrOpts = { showSymbol?: boolean; showUnit?: boolean; max?: number; min?: number };
/** Mirror of core/pipes/inr-format.pipe.ts. */
export function inr(value: unknown, format: 'auto' | 'cr' | 'lakh' | 'k' | 'inr' = 'auto', o: InrOpts = {}): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '-';
  const n = Number(value);
  const abs = Math.abs(n);
  const { showSymbol = true, showUnit = true, max = 0, min = 0 } = o;
  const lo = { maximumFractionDigits: max, minimumFractionDigits: min };
  let f: string;
  const div = (d: number, unit: string) => {
    f = (n / d).toLocaleString('en-IN', lo);
    if (showUnit) f += unit;
  };
  switch (format) {
    case 'cr': div(1e7, ' Cr'); break;
    case 'lakh': div(1e5, ' Lakh'); break;
    case 'k': div(1e3, ' K'); break;
    case 'inr': f = n.toLocaleString('en-IN', lo); break;
    default:
      if (abs >= 1e7) div(1e7, ' Cr');
      else if (abs >= 1e5) div(1e5, ' Lakh');
      else if (abs >= 1e3) div(1e3, ' K');
      else f = n.toLocaleString('en-IN', lo);
  }
  return showSymbol ? `₹ ${f!}` : f!;
}

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
export const stripHtml = (html: string) => norm(html.replace(/<[^>]*>/g, ' '));

/** Three FY labels ending with `year` (mirror of getYearsArray()). */
export function threeYears(year: string): string[] {
  const y = parseInt(year.split('-')[0], 10);
  return [y - 2, y - 1, y].map((s) => `${s}-${String(s + 1).slice(-2)}`);
}

export function snackbar(msg: string) {
  cy.contains('.mat-mdc-snack-bar-label', msg).should('be.visible');
}

/** City details are hydrated from SSR TransferState, so fetch them directly. */
export function cityDetails(slug = SLUG) {
  return cy
    .request(`${API}/dashboard/city/city-details?citySlugName=${slug}`)
    .its('body');
}

export function interceptCommon() {
  // Strip conditional-request headers so the API never answers 304 with an
  // empty body (tests read response bodies to derive expected values).
  cy.intercept({ method: 'GET', url: '**/api/v1/**' }, (req) => {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
  });
  cy.intercept('GET', '**/api/v1/ledger/getYearsDynamic*').as('yearsDynamic');
  cy.intercept('GET', '**/api/v1/ledger/getCityDasboardIndicators*').as('indicators');
  // The page fires the Overview call twice on load; a specific alias per
  // keyType + last FY lets tests wait for exactly the call they triggered.
  cy.intercept('GET', '**/api/v1/ledger/getCityDasboardIndicators*', (req) => {
    const u = new URL(req.url);
    const ys = u.searchParams.getAll('years[]');
    req.alias = `ind_${u.searchParams.get('keyType')}_${ys[ys.length - 1]}`;
  });
  cy.intercept('GET', '**/api/v1/ledger/getFaqs*').as('faqs');
}

export function visitCity(slug = SLUG, qs = '') {
  interceptCommon();
  cy.visit(`/municipal-data/city/${slug}${qs}`);
}

export function tab(label: string) {
  return cy.contains('[role="tab"]', label);
}

/** mat-tree-node whose name cell equals `name` exactly. */
export function treeNode(name: string) {
  return cy
    .get('app-financial-performance mat-tree-node')
    .filter((_, el) => norm(el.querySelector('.px-2 > div')?.textContent || '') === name);
}

export function fpCellText(year: unknown, graphKey: string): string {
  if (year === null || year === undefined || isNaN(Number(year)) || graphKey === 'percentage') return String(year);
  return inr(year, 'inr', { showSymbol: false, showUnit: false, max: 2, min: 0 });
}

/** Assert every top-level node (and the expanded node's children) of a getCityDasboardIndicators response. */
export function assertTree(data: any[], expanded?: any) {
  data.forEach((node) => {
    treeNode(node.name).should('have.length', 1).first().within(() => {
      cy.get('.px-2 > .d-flex > div').should('have.length', node.yearData.length).each(($cell, i) => {
        const txt = norm($cell.text());
        expect(txt, `${node.name} [${i}]`).to.contain(node.isHeader ? String(node.yearData[i]) : fpCellText(node.yearData[i], node.graphKey));
        const g = node.yearGrowth?.[i];
        if (g) expect(txt).to.contain(`(${g}%)`);
      });
    });
  });
  if (expanded?.children?.length) {
    expanded.children.forEach((c: any) => treeNode(c.name).should('be.visible'));
  }
}

export function chartTitle() {
  return cy.get('app-financial-performance #chartContainer span.fw-bold');
}

export function chartTitleIs(name: string) {
  chartTitle().should(($s) => expect(norm($s.text())).to.eq(name));
}

/** Mirror of the warning logic in financial-performance.ts getIndicators(). */
export function expectedWarning(keyType: string, res: any, ulbName: string): string | null {
  const ds = res.response.data as any[];
  const last = (n: any) => (n && Array.isArray(n.yearData) ? n.yearData[n.yearData.length - 1] : undefined);
  let msg: string | null = null;
  if (keyType === 'debt') {
    const totalDebt = ds.find((i) => i?.name === 'Total Debt (Cr)');
    const dar = ds.find((i) => i?.name === 'Debt to Asset Ratio');
    const iscr = ds.find((i) => i?.name?.trim?.() === 'Interest Service Coverage Ratio (ISCR)');
    const l = last(iscr);
    if (l !== undefined && l < -5) msg = `${ulbName}'s ISCR is significantly negative`;
    else if (l !== undefined && l > 20) msg = `${ulbName}'s unusually high ISCR`;
    const ld = last(totalDebt);
    if (totalDebt && (ld == null || (typeof ld === 'string' && ld.trim().toUpperCase() === 'N/A')))
      msg = `Since ${ulbName} has reported no outstanding debt`;
    const lz = last(dar);
    if (dar && lz !== null && lz !== undefined && lz !== '' && !isNaN(Number(lz)) && Number(lz) === 0)
      msg = `${ulbName}'s debt-to-asset ratio is effectively zero`;
  } else if (keyType === 'expenditure') {
    const flag = res.response.CapexflagStatus?.flag;
    if (flag === 'INCOMPLETE_LINE_ITEMS') msg = `has not reported Gross Block or CWIP`;
    else if (flag === 'ZERO_TOTAL_CAPEX') msg = `has reported Gross Block + CWIP as zero`;
    else if (flag === 'NEGATIVE_GROWTH' || flag === 'DATA_NOT_FOUND') msg = `did not record an increase in Gross Block + CWIP`;
  }
  return msg;
}


/** Click a dashboard tab, centring it so the sticky site header can't cover it. */
export function openTab(label: string) {
  tab(label).click({ scrollBehavior: 'center' });
}
