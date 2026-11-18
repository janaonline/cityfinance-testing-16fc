# cityfinance-testing-16fc

Cypress end-to-end tests for [CityFinance](https://staging.cityfinance.in), covering:

- **Public pages:** everything a logged-out visitor sees (home, dashboards, resources).
- **XVI-FC Grant portal:** the 16th Finance Commission forms for ULB, STATE and MoHUA users.

All tests run against **staging** (`https://staging.cityfinance.in`).

## Setup

You need Node.js 18 or newer and Git.

```bash
git clone https://github.com/janaonline/cityfinance-testing-16fc.git
cd cityfinance-testing-16fc
npm install
```

The **public-page tests need no login or `.env` file**. The XVI-FC tests do; see [Credentials](#credentials-xvi-fc-tests-only).

## Running the tests

### Open the Cypress window (pick and watch specs)

```bash
npx cypress open --e2e --browser electron
```

Click any spec under **Public** or **XVIFC26** to watch it run.

### Run all public pages

```bash
# In a visible browser, one spec after another
npx cypress run --headed --spec "cypress/e2e/Public/*.cy.ts"

# Without a browser window (about 40 min; prints a pass/fail table at the end)
npx cypress run --spec "cypress/e2e/Public/*.cy.ts"
```

### Run one page

```bash
npx cypress run --headed --spec "cypress/e2e/Public/PublicHome.cy.ts"
```

To run several pages, separate them with a comma:

```bash
npx cypress run --headed --spec "cypress/e2e/Public/PublicHome.cy.ts,cypress/e2e/Public/PublicLogin.cy.ts"
```

### Run all XVI-FC portal tests

```bash
npx cypress run --spec "cypress/e2e/XVIFC26/*.cy.ts"
```

### Useful options

| Option | What it does |
|---|---|
| `--headed` | Shows the browser while the tests run |
| `--config video=false` | Skips video recording, so runs finish faster |
| `--browser chrome` | Uses Chrome instead of the built-in Electron browser |

Screenshots of failed tests are saved in `cypress/screenshots/`.

## Public page specs: `cypress/e2e/Public/`

| Page | URL | Spec |
|---|---|---|
| Home | `/home` | `PublicHome.cy.ts` |
| Header, navbar, footer | every page | `PublicHeaderFooter.cy.ts` |
| Login | `/auth/login` | `PublicLogin.cy.ts` |
| National dashboard | `/municipal-data/national` | `PublicNationalDashboard.cy.ts` |
| State dashboard | `/municipal-data/state/:slug` | `PublicStateDashboard.cy.ts` |
| City dashboard | `/municipal-data/city/:slug` | `PublicCityDashboard.cy.ts` |
| City: Financial Performance | city page tab | `PublicCityFinancialPerformance.cy.ts` |
| City: Balance Sheet / Income Statement | city page tab | `PublicCityBalanceSheet.cy.ts` |
| City: Borrowing & Credit Rating | city page tab | `PublicCityBorrowing.cy.ts` |
| City: Service Level Benchmarks | city page tab | `PublicCitySlb.cy.ts` |
| City: Compare | `/municipal-data/city/comparewith` | `PublicCityCompare.cy.ts` |
| Market Readiness Assessment | `/municipal-data/market-readiness` | `PublicMarketReadiness.cy.ts` |
| Own Revenue dashboard | `/v1/own-revenue-dashboard` | `PublicOwnRevenueDashboard.cy.ts` |
| Municipal Bonds | `/v1/municipal-bonds` | `PublicMunicipalBonds.cy.ts` |
| Municipal Budgets | `/v1/municipal-budgets` | `PublicMunicipalBudgets.cy.ts` |
| Resources: main page | `/v1/resources-dashboard` | `PublicResourcesShell.cy.ts` |
| Resources: Data Sets | `/v1/resources-dashboard/data-sets/...` | `PublicResourcesDataSets.cy.ts` |
| Resources: Learning Center | `/v1/resources-dashboard/learning-center/...` | `PublicResourcesLearningCenter.cy.ts` |
| Resources: Reports & Publications | `/v1/resources-dashboard/report-publications` | `PublicResourcesReports.cy.ts` |

`cityDashboardHelpers.ts` holds helpers shared by the City specs.

Staging runs two apps. The new app serves `/home`, `/municipal-data/...` and `/auth/login`. The older app is served under `/v1/`; its pages without the `/v1/` prefix redirect to `/home`.

## XVI-FC Grant portal specs: `cypress/e2e/XVIFC26/`

| Role | Specs |
|---|---|
| ULB | `BankAccountPFMS`, `DetailedUtilisationReport`, `ServiceLevelBenchmarks`, `SLBActualTargetDirection`, `UlbConditions`, `UlbFinancialStatements`, `UserAcessManagement` |
| STATE | `StateRequirements`, `StateSfcStatus`, `StateElectedBodyStatus`, `StateUlbWiseAllocation`, `StateFcUnspentDeclaration`, `StateGrantTransferCertificate`, `StateClaimLetter`, `StateUlbSubmissions` |
| MoHUA | `MohuaOverview`, `MohuaClaimsSubmissions`, `MohuaGenerateOm`, `MohuaOmHistory`, `MohuaStateReview` |

Login is shared: `cypress/support/xvifcSession.ts` logs in once per account and reuses the session across specs.

### Credentials (XVI-FC tests only)

Create a `.env` file in the project root with these keys. Ask the team for the values. **Never commit this file.**

```
XVFCULB_ID=
XVIFCULB_pass=
STATE_USER_ID=
STATE_PASSWORD=
MOHUA_USER_ID=
MOHUA_PASSWORD=
```

Staging locks an account after repeated failed logins, so don't run the login tests in a tight loop.

### Specs that change data (`*Mutating.cy.ts`)

`ServiceLevelBenchmarksMutating` and `UlbFinancialStatementsMutating` make real changes on staging. For example, they upload and delete documents. They are **excluded from normal runs**. To run one, name it and clear the exclusion:

```bash
npx cypress run --spec "cypress/e2e/XVIFC26/UlbFinancialStatementsMutating.cy.ts" --config "excludeSpecPattern=[]"
```

The dummy documents they upload are in `cypress/fixtures/financial-statements/`, generated by `generate.js`.

## How the tests are written

- **Live data:** expected values come from the app's own API responses (`cy.intercept`), not hard-coded numbers, so tests keep passing as staging data changes.
- **Safe for staging:** read-only tests never submit forms that save data. They open dialogs, check validation, then cancel.
- **Skips:** when staging has no data for a case, the test skips and logs the reason instead of failing.
- **Known staging bugs:** some tests assert the correct behaviour and note a known staging bug in a comment, so the test fails or skips until the app is fixed.

## Troubleshooting

- **Cypress won't start from the VS Code terminal** (for example, a "bad option" error): the `ELECTRON_RUN_AS_NODE` variable is set. Clear it first:
  - Git Bash: `env -u ELECTRON_RUN_AS_NODE npx cypress open`
  - PowerShell: `$env:ELECTRON_RUN_AS_NODE=$null; npx cypress open`
  - Or use `npm run cy:open`.
- **"Renderer process crashed" or the test tab closes:** the machine is low on memory. Close other Cypress windows and run fewer specs at once.
- **A test fails once, then passes:** staging can be slow. Re-run the spec before reporting a bug, and attach the screenshot from `cypress/screenshots/`.
