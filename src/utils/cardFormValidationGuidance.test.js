import { cardFormValidationGuidance } from "./cardFormValidationGuidance";

describe("cardFormValidationGuidance", () => {
  test("orienta revisão dos dados quando token seguro ainda não existe", () => {
    expect(cardFormValidationGuidance({ paymentMethodId: "visa", installments: 1 })).toEqual({
      reason: "card_details_not_validated",
      message: "Revise o número, a validade e o código de segurança do cartão. Um desses dados ainda não foi validado pelo ambiente seguro.",
    });
  });

  test("orienta revisão do número quando a bandeira não foi identificada", () => {
    expect(cardFormValidationGuidance({ token: "tok", installments: 1 })).toEqual({
      reason: "payment_method_not_identified",
      message: "Não foi possível identificar a bandeira do cartão. Revise o número do cartão e tente novamente.",
    });
  });

  test("orienta escolher parcelamento quando ele ainda não está definido", () => {
    expect(cardFormValidationGuidance({ token: "tok", paymentMethodId: "visa" })).toEqual({
      reason: "installments_not_selected",
      message: "Escolha a quantidade de parcelas antes de continuar com o pagamento.",
    });
  });

  test("libera o envio quando os dados mínimos do SDK estão prontos", () => {
    expect(cardFormValidationGuidance({ token: "tok", paymentMethodId: "visa", installments: 1 })).toBeNull();
  });
});
