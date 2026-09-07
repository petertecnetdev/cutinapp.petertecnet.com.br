const messageTimestamp = (message) => {
  const timestamp = new Date(message?.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const messageId = (message) => String(message?.id ?? "");

export const isTransientMessage = (message) => (
  message?.pending === true
  || message?.failed === true
  || messageId(message).startsWith("local-")
);

export const sortMessagesChronologically = (messages = []) => [...messages].sort((left, right) => {
  const timeDifference = messageTimestamp(left) - messageTimestamp(right);
  if (timeDifference !== 0) return timeDifference;
  return messageId(left).localeCompare(messageId(right), "en", { numeric: true });
});

export const reconcileMessageSnapshot = (currentMessages = [], incomingMessages = []) => {
  const confirmedById = new Map();
  const transientById = new Map();

  currentMessages.forEach((message) => {
    const id = messageId(message);
    if (!id) return;
    if (isTransientMessage(message)) transientById.set(id, message);
    else confirmedById.set(id, message);
  });

  incomingMessages.forEach((message) => {
    const id = messageId(message);
    if (!id) return;
    confirmedById.set(id, message);
    transientById.delete(id);
  });

  return sortMessagesChronologically([
    ...confirmedById.values(),
    ...transientById.values(),
  ]);
};
