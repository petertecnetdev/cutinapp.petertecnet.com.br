import { canonicalAppId, sameAppId } from './independenceAppId';

/**
 * Regressões de colisão numérica: duas aplicações diferentes não podem
 * parecer a mesma aplicação quando seus IDs ultrapassam 2^53 - 1.
 * O backend continua sendo a única autoridade de autorização.
 */
describe('Independence: colisões de identificadores de aplicação', () => {
  test.each([
    ['9007199254740992', '9007199254740993'],
    ['9007199254740993', '9007199254740994'],
    ['9223372036854775806', '9223372036854775807'],
    ['9223372036854775807', '9223372036854775808'],
  ])('não confunde IDs distintos %s e %s após arredondamento de Number', (left, right) => {
    expect(canonicalAppId(left)).toBe(left);
    expect(canonicalAppId(right)).toBe(right);
    expect(sameAppId(left, right)).toBe(false);
    expect(sameAppId(right, left)).toBe(false);
  });

  test('mantém equivalência apenas após remoção de zeros à esquerda', () => {
    const app = '9223372036854775807';
    const same = `000${app}`;
    const other = '9223372036854775808';

    expect(canonicalAppId(same)).toBe(app);
    expect(sameAppId(same, app)).toBe(true);
    expect(sameAppId(same, other)).toBe(false);
  });

  test('rejeita valores Number inseguros mesmo quando arredondam para um ID existente', () => {
    const app = '9007199254740993';
    const rounded = Number(app);

    expect(Number.isSafeInteger(rounded)).toBe(false);
    expect(canonicalAppId(rounded)).toBe('');
    expect(sameAppId(app, rounded)).toBe(false);
    expect(sameAppId(rounded, app)).toBe(false);
  });

  test('preserva IDs decimais extensos sem coerção e rejeita valores diferentes', () => {
    const app = '9'.repeat(100);
    const other = `${'9'.repeat(99)}8`;

    expect(canonicalAppId(app)).toBe(app);
    expect(sameAppId(`000${app}`, app)).toBe(true);
    expect(sameAppId(app, other)).toBe(false);
  });
});
