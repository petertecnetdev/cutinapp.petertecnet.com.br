import { canonicalAppId, sameAppId } from './independenceAppId';

describe('Identificadores de aplicação no frontend Independence', () => {
  test.each([
    [1, '1'],
    [7, '7'],
    ['007', '7'],
    ['0001', '1'],
    ['0000000000000000000001', '1'],
    ['9007199254740991', '9007199254740991'],
    ['9007199254740992', '9007199254740992'],
    ['9223372036854775807', '9223372036854775807'],
    ['0009223372036854775807', '9223372036854775807'],
    [Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)],
  ])('normaliza %s sem perder precisão', (value, expected) => {
    expect(canonicalAppId(value)).toBe(expected);
  });

  test.each([
    null, undefined, 0, -0, -1, 1.5, NaN, Infinity, -Infinity,
    Number.MAX_SAFE_INTEGER + 1, '', '0', '000', '-7', '+7',
    '7.0', '7e0', '0x7', ' 7', '7 ', '\n7', '7\n',
    '7\u0000', '7\r', '7\u2028', '7\u2029', '7,0', '7_0', '７', '٧',
    {}, [[]], [['7']], true, false, 7n, Symbol('7'),
  ])('rejeita identificador não decimal ou não seguro %s', value => {
    expect(canonicalAppId(value)).toBe('');
  });

  test.each([
    [7, '007'],
    [1, '0000000000000000000001'],
    ['9007199254740992', '09007199254740992'],
    ['9223372036854775807', '0009223372036854775807'],
  ])('reconhece equivalência exata entre %s e %s', (left, right) => {
    expect(sameAppId(left, right)).toBe(true);
    expect(sameAppId(right, left)).toBe(true);
  });

  test.each([
    [7, 8], [null, null], [0, '000'], [7, '0x7'],
    ['9007199254740992', Number.MAX_SAFE_INTEGER + 1],
    ['9223372036854775807', '9223372036854775806'],
    ['0001', '0002'], [true, 1], [7n, '7'],
  ])('não confunde aplicações %s e %s', (left, right) => {
    expect(sameAppId(left, right)).toBe(false);
    expect(sameAppId(right, left)).toBe(false);
  });

  test('não executa conversão implícita de objetos externos', () => {
    const toString = jest.fn(() => '7');
    const input = { toString };
    expect(canonicalAppId(input)).toBe('');
    expect(sameAppId(input, 7)).toBe(false);
    expect(toString).not.toHaveBeenCalled();
  });
});
