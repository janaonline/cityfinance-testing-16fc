describe("Home page", () => {

    beforeEach(function () {
      cy.visit("https://www.cityfinance.in/fc_grant");
    });


    it("validation of Ulb login page", () => {

        cy.get('button.mat-mdc-menu-trigger[aria-haspopup="menu"]').eq(0).click();
         cy.get('i.bi-box-arrow-in-right').eq(0).click();
    cy.get('input[type="submit"]').contains('LOGIN').click();
    cy.get("#ulb i").click();
        cy.get(".formTitle").should("contain", "Sign In");
        cy.xpath("//input[@type='email']").should("have.class", "ng-invalid");
        cy.xpath("//input[@id='mat-input-1']").type("Abh@1234");
        cy.wait(4000);
        cy.get("mat-icon[role='img']").click();








    })

})
  