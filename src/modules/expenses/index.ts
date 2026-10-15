import 'server-only';

// Public API of the expenses module (api-spec §13).
export {
  createExpenseHandler,
  deleteExpenseHandler,
  expenseSummaryHandler,
  exportExpensesHandler,
  getExpenseCategoriesHandler,
  listExpensesHandler,
  openReceiptHandler,
  setExpenseCategoriesHandler,
  updateExpenseHandler,
} from './expenses.handlers';
export { expensesCollectionSpecs } from './expenses.indexes';
export { moveEventExpensesToGeneral } from './expenses.service';
export type { Expense, ExpenseSummary } from './expenses.types';
