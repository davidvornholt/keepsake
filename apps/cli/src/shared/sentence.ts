/** A text that ends like a sentence. */
export const sentence = (text: string): string => {
  const trimmed = text.trim();
  return trimmed === '' || trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
};
