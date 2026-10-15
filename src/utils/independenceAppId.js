/**
 * Canonicaliza identificadores de aplicação para comparações apenas de UI.
 * Não converte strings decimais em Number, preservando IDs acima de 2^53-1.
 * Autorização e isolamento de aplicações são responsabilidade exclusiva da API.
 */
export const canonicalAppId = (value) => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
  }
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return '';
  return value.replace(/^0+/, '');
};

/** Retorna false para identificadores ausentes, inválidos ou de aplicações distintas. */
export const sameAppId = (left, right) => {
  const canonicalLeft = canonicalAppId(left);
  return canonicalLeft !== '' && canonicalLeft === canonicalAppId(right);
};
