export const reportError = (error: Error | string, context?: string): void => {
  console.error(`[${context || 'Error'}]:`, error);
};
