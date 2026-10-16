/**
 * Canonicaliza IDs decimais positivos sem conversão imprecisa para Number.
 * Este utilitário não substitui validação ou autorização no servidor.
 */
export const canonicalPositiveDecimalId = (value) => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
  }
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return '';
  return value.replace(/^0+/, '');
};

/** Normaliza identificadores de aplicação apenas para comparações de UI. */
export const canonicalAppId = canonicalPositiveDecimalId;

/** Retorna false para identificadores ausentes, inválidos ou de aplicações distintas. */
export const sameAppId = (left, right) => {
  const canonicalLeft = canonicalAppId(left);
  return canonicalLeft !== '' && canonicalLeft === canonicalAppId(right);
};
