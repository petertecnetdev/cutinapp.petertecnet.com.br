import { canonicalPositiveDecimalId } from './independenceAppId';

/**
 * Contrato de transporte da reivindicação: entity_id é um inteiro decimal
 * positivo serializado como string, sem perda de precisão no JavaScript.
 * A API continua responsável por validar titularidade, app e autorização.
 */
describe('Independence: identificador de entidade enviado à API', () => {
  test.each([
    [1, '1'],
    ['0001', '1'],
    [Number.MAX_SAFE_INTEGER, '9007199254740991'],
    ['9007199254740992', '9007199254740992'],
    ['9007199254740993', '9007199254740993'],
    ['18446744073709551615', '18446744073709551615'],
    ['00018446744073709551615', '18446744073709551615'],
  ])('preserva o identificador %s como decimal exato', (input, expected) => {
    expect(canonicalPositiveDecimalId(input)).toBe(expected);
  });

  test.each([
    null, undefined, '', 0, -1, 1.5,
    Number.MAX_SAFE_INTEGER + 1,
    '0', '0000', '-1', '+1', '1.0', '1e3', ' 1', '1 ',
    '0x1', true, false, 1n, {}, ['1'],
  ])('não transforma valor inválido %s em entity_id', (input) => {
    expect(canonicalPositiveDecimalId(input)).toBe('');
  });

  test('serializa o ID de 64 bits como string JSON, sem arredondar', () => {
    const entityId = canonicalPositiveDecimalId('18446744073709551615');
    const payload = JSON.stringify({ entity_id: entityId });

    expect(payload).toBe('{"entity_id":"18446744073709551615"}');
    expect(JSON.parse(payload).entity_id).toBe('18446744073709551615');
    expect(typeof JSON.parse(payload).entity_id).toBe('string');
  });

  test('não executa coerção implícita de objeto vindo de fonte externa', () => {
    const toPrimitive = jest.fn(() => '7');
    const entityId = canonicalPositiveDecimalId({ [Symbol.toPrimitive]: toPrimitive });

    expect(entityId).toBe('');
    expect(toPrimitive).not.toHaveBeenCalled();
  });
});
