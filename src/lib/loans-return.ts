/**
 * Facade/shim for loans-return functionality.
 * Re-exports all public APIs from modular split:
 * - returnLoan.ts — returnLoan logic + RPC + compensation
 * - extendLoan.ts — extendLoan logic + optimistic lock
 * - legacyReturn.ts — fallback read-then-write logic + shared helpers
 *
 * RETURN-CLAMP: stock clamp logic in legacyReturn.ts uses Math.min(stock_total, stock_available + 1) for baik returns
 */

export { returnLoan, type ReturnLoanOptions } from './returnLoan';
export { extendLoan, type ExtendLoanOptions } from './extendLoan';
export {
  legacyReturnLoan,
  tryRevertLoanReturn,
  getFineRate,
  retryableError,
  type SupabaseLike,
  type ReturnLoanOptions as LegacyReturnLoanOptions,
} from './legacyReturn';
