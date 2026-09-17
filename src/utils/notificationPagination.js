export const mergeNotificationPage = (current, nextPage, page) => {
  if (page === 1) return nextPage;

  const existingIds = new Set(current.map((item) => item.id));
  return [...current, ...nextPage.filter((item) => !existingIds.has(item.id))];
};
