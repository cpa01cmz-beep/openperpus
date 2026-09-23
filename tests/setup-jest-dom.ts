import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
// Also patch global expect for any code that uses globalThis.expect
globalThis.expect = expect;
