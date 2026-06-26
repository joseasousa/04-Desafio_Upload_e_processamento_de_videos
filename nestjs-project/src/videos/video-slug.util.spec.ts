import { generateVideoSlug } from './video-slug.util';

describe('generateVideoSlug', () => {
  it('generates a short URL-safe slug', () => {
    const slug = generateVideoSlug();

    expect(slug).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });
});
