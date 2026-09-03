import "cypress-file-upload";
require('cypress-xpath');
describe("test1", () => {

  const XVFCULB_ID = Cypress.env("XVFCULB_ID");
  const XVIFCULB_pass= Cypress.env("XVIFCULB_pass");
  it("should verify that the user is on the 16th FC Login Homepage", () => {
    cy.visit("https://dev.cityfinance.in/fc/auth/login/16thFC");

    cy.url().should("eq", "https://dev.cityfinance.in/fc/auth/login/16thFC");


  });

//   it("sign in box UI", () => {
//     cy.visit("https://dev.cityfinance.in/fc/auth/login/16thFC");
//     cy.contains("Sign In").should("be.visible");
//     cy.contains("Select your role, then enter your credentials below").should("be.visible");
//     cy.contains('span.role-card__label', 'ULB').should('be.visible');
//     cy.contains('span.role-card__label', 'State DMA').should('be.visible');
//     cy.contains('span.role-card__label', 'MoHUA').should('be.visible');
//     cy.contains('span.role-card__label', 'Institutional').should('be.visible');
//     cy.get('input[formcontrolname="identifier"][placeholder="Mobile, email or census code"]').should("be.visible");
//     cy.contains("button, a, span", "Continue").should("be.visible");
//     cy.contains("Need Help?").should("be.visible");
//     cy.get('a[href="mailto:16fcgrant@cityfinance.in"]')
//       .should("be.visible")
//       .and("have.text", "16fcgrant@cityfinance.in");
//   });

//   it('shows validation when submitted without entering ULB login value', () => {
//     cy.visit('https://dev.cityfinance.in/fc/auth/login/16thFC')
    
//      cy.contains('span.role-card__label', 'ULB').click();
//      cy.contains('button', 'Continue').click();
//      cy.contains('.field-error', 'Mobile number, email or Census Code is required.')
//   .should('be.visible');
 
//   })

//    it('Check invalid ulb id', () => {
//     cy.visit('https://dev.cityfinance.in/fc/auth/login/16thFC')
    
//      cy.contains('span.role-card__label', 'ULB').click();
//      cy.get('input[formcontrolname="identifier"]')
//   .type('435673', { force: true });
//      cy.contains('button', 'Continue').click();
//      cy.contains('User not found. Please check your details.')
//   .should('be.visible');
 
//   })

//   it('Check with valid email id', () => {
//     cy.visit('https://dev.cityfinance.in/fc/auth/login/16thFC')
    
//      cy.contains('span.role-card__label', 'ULB').click();
//      cy.get('input[formcontrolname="identifier"]')
//   .type('test@gmail.com', { force: true });
//      cy.contains(' Valid email address ')
//   .should('be.visible');



//   })



// it('log into ULB using invalid ulb password', () => {
//     cy.visit('https://dev.cityfinance.in/fc/auth/login/16thFC')
    
//      cy.contains('span.role-card__label', 'ULB').click();
//      cy.get('input[formcontrolname="identifier"]')
//   .type('555557', { force: true });
//        cy.contains('button', 'Continue').click();
//            cy.wait(10000);


//       cy.contains('Password is required.')
//   .should('be.visible');
//   cy.get('input[formcontrolname="password"]')
//   .should('be.visible')
//   .click()
//   .type('ulb@1234', { force: true })

// cy.get('span.mat-mdc-button-touch-target')
//   .eq(3)
//   .click({ force: true });;


//   cy.contains('Invalid ULB Code/Census Code or password')
//   .should('be.visible');



// })



// it('Log into ULB using valid mobile number', () => {
//     cy.visit('https://dev.cityfinance.in/fc/auth/login/16thFC')
    
//      cy.contains('span.role-card__label', 'ULB').click();
//      cy.get('input[formcontrolname="identifier"]')
//   .type('9527003333', { force: true });
//                     cy.wait(10000);


//        cy.contains('button', 'Continue').click();
//                   cy.wait(10000);


//       cy.contains('Password is required.')
//   .should('be.visible');
//   cy.get('input[formcontrolname="password"]')
//   .should('be.visible')
//   .click()
//   .type('ulb@123', { force: true })

//              cy.wait(10000);


// cy.get('span.mat-mdc-button-touch-target')
//   .eq(3)
//   .click({ force: true });
//                       cy.wait(100000);

  
//       cy.contains('2026-27')
//   .should('be.visible');

// cy.get('button.continue-btn')
//   .click();
//                     cy.wait(10000);


//   cy.contains('h2', 'Kondhali Town Panchayat')
//   .should('be.visible');
// })




it('ULB Submitter flow', () => {
    cy.visit('https://dev.cityfinance.in/fc/auth/login/16thFC')
    
     cy.contains('span.role-card__label', 'ULB').click();
     cy.get('input[formcontrolname="identifier"]')
  .type('535071', { force: true });
                    cy.wait(10000);
       cy.contains('button', 'Continue').click();
                  cy.wait(10000);


      cy.contains('Password is required.')
  .should('be.visible');
  cy.get('input[formcontrolname="password"]')
  .should('be.visible')
  .click()
  .type('ulb@123', { force: true })

             cy.wait(10000);


cy.get('span.mat-mdc-button-touch-target')
  .eq(3)
  .click({ force: true });
                      cy.wait(40000);

  
      cy.contains('2026-27')
  .should('be.visible');

cy.get('button.continue-btn')
  .click();
                    cy.wait(10000);


  cy.contains('h2', 'Kondhali Town Panchayat')
  .should('be.visible');
  cy.contains('span.menu-label', 'unified view')
  .click({ force: true });

   cy.contains('People & Roles') .should('be.visible');
   cy.contains('span.mdc-button__label', 'Add Member')
  .should('be.visible')
  .closest('button')
  .should('be.enabled');
  cy.contains('span.mdc-button__label', 'Add Member')
  .closest('button')
  .click({ force: true });
  cy.get('#mat-select-8').click();

cy.get('.mat-mdc-option')
  .first()
  .click();

  const randomName = `Test User ${Math.floor(Math.random() * 100000)}`;

cy.get('input[formcontrolname="fullName"]')
  .clear()
  .type(randomName);

cy.log(`Entered Name: ${randomName}`);


const randomMobile =
  Math.floor(1000000000 + Math.random() * 9000000000).toString();

cy.get('input[name="addPhone"]')
  .clear()
  .type(randomMobile);

cy.log(`Mobile Number: ${randomMobile}`);

cy.contains('button', 'Add Member')
  .click({ force: true });




})






})













