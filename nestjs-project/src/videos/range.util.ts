import { InvalidRangeException } from '../common/exceptions/domain.exception';

export interface ParsedRange {
  start: number;
  end: number;
  contentLength: number;
}

export function parseHttpRange(
  rangeHeader: string | undefined,
  size: number,
): ParsedRange | null {
  if (!rangeHeader) return null;

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) throw new InvalidRangeException();

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) throw new InvalidRangeException();

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      throw new InvalidRangeException();
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    throw new InvalidRangeException();
  }

  end = Math.min(end, size - 1);

  return {
    start,
    end,
    contentLength: end - start + 1,
  };
}
