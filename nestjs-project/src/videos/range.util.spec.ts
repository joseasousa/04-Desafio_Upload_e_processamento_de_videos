import { InvalidRangeException } from '../common/exceptions/domain.exception';
import { parseHttpRange } from './range.util';

describe('parseHttpRange', () => {
  it('returns null without range header', () => {
    expect(parseHttpRange(undefined, 100)).toBeNull();
  });

  it('parses explicit byte range', () => {
    expect(parseHttpRange('bytes=10-19', 100)).toEqual({
      start: 10,
      end: 19,
      contentLength: 10,
    });
  });

  it('parses suffix byte range', () => {
    expect(parseHttpRange('bytes=-10', 100)).toEqual({
      start: 90,
      end: 99,
      contentLength: 10,
    });
  });

  it('caps open-ended ranges to object size', () => {
    expect(parseHttpRange('bytes=95-', 100)).toEqual({
      start: 95,
      end: 99,
      contentLength: 5,
    });
  });

  it('throws on unsatisfiable ranges', () => {
    expect(() => parseHttpRange('bytes=100-120', 100)).toThrow(
      InvalidRangeException,
    );
  });
});
