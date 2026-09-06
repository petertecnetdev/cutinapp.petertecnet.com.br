export const activateOnKeyboard = (event, action) => {
  if (event.key !== "Enter" && event.key !== " ") return false;
  event.preventDefault();
  action();
  return true;
};
