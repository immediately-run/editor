// Vitest setup: jest-dom matchers (toBeInTheDocument, toHaveAttribute, …) and a
// per-test DOM cleanup.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom has no URL.createObjectURL; the R3-804 image overlay builds one per
// shown image. A counter-backed stub keeps the URLs distinct so tests can
// assert a re-read swapped the src.
let objectUrlSeq = 0;
URL.createObjectURL = () => `blob:mock-${++objectUrlSeq}`;
URL.revokeObjectURL = () => {};
