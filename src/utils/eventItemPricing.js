export const effectiveEventItemPrice = (item) => item?.promotion_enabled && Number(item?.promotion_price) >= 0 ? Number(item.promotion_price) : Number(item?.price || 0);
