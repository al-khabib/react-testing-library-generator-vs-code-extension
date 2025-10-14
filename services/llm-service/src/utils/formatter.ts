import prettier from 'prettier';
import { logger } from './logger';

const extractCodeBlock = (raw: string): string => {
  const fenced = /```(?:typescript|tsx|javascript|js)?\s*([\s\S]*?)```/im.exec(raw);
  if (fenced && fenced[1]) {
    return fenced[1];
  }

  const importIndex = raw.search(/(^|\n)\s*import\s+/);
  if (importIndex >= 0) {
    return raw.slice(importIndex).trim();
  }

  return raw.trim();
};

export const formatGeneratedTest = async (content: string): Promise<string> => {
  const extracted = extractCodeBlock(content);

  try {
    const formatted = await prettier.format(extracted, {
      parser: 'typescript',
      semi: true,
      singleQuote: true
    });
    return formatted.trim();
  } catch (error) {
    logger.warn('Failed to format generated test. Returning extracted content.', {
      error: error instanceof Error ? error.message : error
    });
    return extracted;
  }
};
