import { alertElementText, joinAlertTextSegments } from "./sweetAlert";

describe("alert copy formatting", () => {
  test("preserva a fronteira entre título e corpo de um Alert convertido", () => {
    document.body.innerHTML = `
      <div class="alert alert-success">
        <i class="fa-solid fa-circle-play" aria-hidden="true"></i>
        <div>
          <strong>Este evento está acontecendo agora</strong>
          <span>O evento já começou. Término previsto para segunda-feira.</span>
        </div>
      </div>
    `;

    expect(alertElementText(document.querySelector(".alert"))).toBe(
      "Este evento está acontecendo agora. O evento já começou. Término previsto para segunda-feira.",
    );
  });

  test("adiciona ponto e espaço entre título sem pontuação e corpo", () => {
    expect(joinAlertTextSegments([
      "Este evento está acontecendo agora",
      "O evento já começou. As ações disponíveis permanecem ativas.",
    ])).toBe(
      "Este evento está acontecendo agora. O evento já começou. As ações disponíveis permanecem ativas.",
    );
  });

  test("preserva pontuação existente sem duplicar sinais", () => {
    expect(joinAlertTextSegments([
      "Este evento ainda vai acontecer.",
      "Confira a programação.",
    ])).toBe("Este evento ainda vai acontecer. Confira a programação.");
  });

  test("normaliza espaços antes de unir segmentos", () => {
    expect(joinAlertTextSegments(["  Atenção  ", "  Revise os dados.  "]))
      .toBe("Atenção. Revise os dados.");
  });
});
