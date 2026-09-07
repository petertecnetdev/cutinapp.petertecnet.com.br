import { commissionPortfolioEconomics } from "./commissionPortfolioEconomics";

describe("commissionPortfolioEconomics", () => {
  test("calcula eficiência e piso protegido a partir do GMV pago", () => {
    expect(commissionPortfolioEconomics({
      grossSales: 10000,
      commissionAmount: 800,
      minimumRetainedMarginPercentage: 3,
    })).toEqual({
      grossSales: 10000,
      commissionAmount: 800,
      commissionShareOfGmv: 8,
      gmvPerCommissionReal: 12.5,
      protectedPeterRevenueFloor: 300,
      retainedMarginPercentage: 3,
    });
  });

  test("não inventa eficiência quando ainda não houve comissão", () => {
    const result = commissionPortfolioEconomics({
      grossSales: 5000,
      commissionAmount: 0,
      minimumRetainedMarginPercentage: 2.5,
    });

    expect(result.gmvPerCommissionReal).toBeNull();
    expect(result.protectedPeterRevenueFloor).toBe(125);
    expect(result.commissionShareOfGmv).toBe(0);
  });

  test("normaliza entradas inválidas e limita a margem protegida", () => {
    expect(commissionPortfolioEconomics({
      grossSales: -100,
      commissionAmount: "inválido",
      minimumRetainedMarginPercentage: 150,
    })).toMatchObject({
      grossSales: 0,
      commissionAmount: 0,
      commissionShareOfGmv: 0,
      gmvPerCommissionReal: null,
      protectedPeterRevenueFloor: 0,
      retainedMarginPercentage: 100,
    });
  });
});
