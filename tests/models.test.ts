import { describe, expect, it } from 'vitest';
import { sortModels, suggestModel } from '../src/lib/models';

const m = (id: string) => ({ id, label: id });

describe('model list', () => {
  const list = sortModels(
    ['gemini-2.5-pro', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3-pro-preview', 'gemini-2.5-flash-image', 'gemini-2.5-flash-preview-tts', 'gemini-embedding-001', 'gemma-3-4b-it', 'gemini-2.0-flash-lite'].map(m),
  );

  it('drops non-text models and orders lightest first', () => {
    expect(list.map((x) => x.id)).toEqual([
      'gemini-flash-lite-latest',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash-lite',
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3-pro-preview',
    ]);
  });

  it('suggests the lightest stable model', () => {
    expect(suggestModel(list)).toBe('gemini-flash-lite-latest');
    expect(suggestModel(sortModels([m('gemini-9-flash-lite-preview'), m('gemini-2.5-flash')]))).toBe('gemini-2.5-flash');
  });
});
