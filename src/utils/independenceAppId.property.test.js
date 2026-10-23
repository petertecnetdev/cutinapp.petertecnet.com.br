import { canonicalAppId, sameAppId } from './independenceAppId';

/**
 * Teste determinístico de propriedade para o isolamento de aplicações.
 * IDs recebidos da API podem ultrapassar Number.MAX_SAFE_INTEGER:
 * a comparação deve ser exata, sem colisão por arredondamento.
 */
describe('Independence: propriedade de isolamento de app_id de 64 bits', () => {
  test('128 pares distintos de IDs de 64 bits nunca são confundidos', () => {
    const mask = (1n << 64n) - 1n;
    let state = 0x9e3779b97f4a7c15n;

    for (let index = 0; index < 128; index += 1) {
      // Xorshift com semente fixa: reproduzível no CI, sem aleatoriedade externa.
      state ^= (state << 13n) & mask;
      state ^= state >> 7n;
      state ^= (state << 17n) & mask;
      state &= mask;

      const current = state.toString();
      const adjacent = (state === mask ? state - 1n : state + 1n).toString();
      const padded = `000${current}`;

      expect(canonicalAppId(current)).toBe(current);
      expect(canonicalAppId(padded)).toBe(current);
      expect(sameAppId(current, padded)).toBe(true);
      expect(sameAppId(padded, adjacent)).toBe(false);
      expect(sameAppId(adjacent, padded)).toBe(false);
    }
  });

  test('não executa conversões de objetos hostis recebidos de dados externos', () => {
    const valueOf = jest.fn(() => 7);
    const toString = jest.fn(() => '7');
    const toPrimitive = jest.fn(() => '7');
    const untrusted = { valueOf, toString, [Symbol.toPrimitive]: toPrimitive };

    expect(canonicalAppId(untrusted)).toBe('');
    expect(sameAppId(untrusted, '7')).toBe(false);
    expect(sameAppId('7', untrusted)).toBe(false);
    expect(valueOf).not.toHaveBeenCalled();
    expect(toString).not.toHaveBeenCalled();
    expect(toPrimitive).not.toHaveBeenCalled();
  });
});
