export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "COGS" | "OTHER";

export type Account = {
  id: number;
  code?: string | null;
  name: string;
  type: AccountType;
  is_active: boolean;
};

export type Entry = {
  id: number;
  date: string;
  memo?: string | null;
  amount: number;
  source_type: string;
  debit_account_id: number;
  credit_account_id: number;
  debit_account: string;
  credit_account: string;
  debit_account_code?: string | null;
  credit_account_code?: string | null;
  debit_account_type?: AccountType | null;
  credit_account_type?: AccountType | null;
};

export type DateRange = "mtd" | "qtd" | "ytd" | "custom";
export type Density = "comfortable" | "compact";
