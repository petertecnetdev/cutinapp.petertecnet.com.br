import { canonicalAppId, sameAppId } from './independenceAppId';

describe('Identificadores de aplicação no frontend Independence', () => {
  test.each([[7, '7'], ['007', '7'], ['0009223372036854775807', '9223372036854775807'], [Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)]])('normaliza %s', (value, expected) => {
    expect(canonicalAppId(value)).toBe(expected);
  });
  test.each([null, undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '', '0', '000', '-7', '+7', '7.0', '7e0', '0x7', ' 7', '7 ', '７', {}, [], true, 7n])('rejeita valor inválido %s', value => {
    expect(canonicalAppId(value)).toBe('');
  });
  test.each([[7, '007'], ['9223372036854775807', '0009223372036854775807']])('reconhece IDs equivalentes %s e %s', (left, right) => {
    expect(sameAppId(left, right)).toBe(true);
  });
  test.each([[7, 8], [null, null], [0, '000'], [7, '0x7'], ['9223372036854775807', '9223372036854775806']])('não confunde aplicativos %s e %s', (left, right) => {
    expect(sameAppId(left, right)).toBe(false);
  });
});
