export function nthOccurrence(
  haystack: string,
  needle: string,
  index: number
): number {
  return haystack.split(needle, index).join(needle).length;
}

export function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
