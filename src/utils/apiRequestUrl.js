export const isRelativeApiRequestUrl = (requestUrl) => {
  const value = String(requestUrl || "").trim();
  if (!value) return true;

  return !/^[a-z][a-z\d+.-]*:/i.test(value) && !value.startsWith("//");
};
