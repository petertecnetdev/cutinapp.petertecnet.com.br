export const cardFormValidationGuidance = (data = {}) => {
  if (!data?.token) {
    return {
      reason: "card_details_not_validated",
      message: "Revise o número, a validade e o código de segurança do cartão. Um desses dados ainda não foi validado pelo ambiente seguro.",
    };
  }

  if (!data?.paymentMethodId) {
    return {
      reason: "payment_method_not_identified",
      message: "Não foi possível identificar a bandeira do cartão. Revise o número do cartão e tente novamente.",
    };
  }

  if (!data?.installments) {
    return {
      reason: "installments_not_selected",
      message: "Escolha a quantidade de parcelas antes de continuar com o pagamento.",
    };
  }

  return null;
};
