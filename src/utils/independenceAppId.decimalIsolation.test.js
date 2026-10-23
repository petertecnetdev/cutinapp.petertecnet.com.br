import { canonicalAppId, sameAppId } from './independenceAppId';

// Protege o isolamento entre aplicações quando IDs de 64 bits chegam como strings.
// A conversão acidental para Number faria IDs adjacentes colidirem.
describe('Independence: isolamento de IDs decimais de 64 bits', () => {
  test('não confunde 100 pares adjacentes, mesmo com zeros à esquerda', () => {
    for (let suffix = 700; suffix < 800; suffix += 1) {
      const id = `9223372036854775${suffix}`;
      const adjacent = `9223372036854775${suffix + 1}`;

      expect(canonicalAppId(id)).toBe(id);
      expect(sameAppId(id, `000${id}`)).toBe(true);
      expect(sameAppId(id, adjacent)).toBe(false);
      expect(sameAppId(adjacent, id)).toBe(false);
      expect(sameAppId(Number(id), id)).toBe(false);
    }
  });
});
