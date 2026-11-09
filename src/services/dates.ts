// Dates in this API are plain YYYY-MM-DD strings, and "today" is the UTC date.
export const todayUtc = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

// Zero-padded ISO dates sort the same as strings and as dates, so a string comparison is enough.
export const isPastDate = (date: string, today: string = todayUtc()): boolean => date < today;