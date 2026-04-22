'use strict';

const { parseQIF, parseDate, parseAmount } = require('../src/main/qif-parser');

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------
describe('parseDate', () => {
  test('parses M/D/YY (US short year >= 50 → 19xx)', () => {
    expect(parseDate('1/15/95')).toBe('1995-01-15');
  });

  test('parses M/D/YY (US short year < 50 → 20xx)', () => {
    expect(parseDate('3/4/24')).toBe('2024-03-04');
  });

  test('parses M/D/YYYY', () => {
    expect(parseDate('12/31/2023')).toBe('2023-12-31');
  });

  test("parses M/D'YY (Quicken apostrophe format)", () => {
    expect(parseDate("6/15'23")).toBe('2023-06-15');
  });

  test('returns null for empty', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  test('returns ISO date unchanged', () => {
    expect(parseDate('2024-07-04')).toBe('2024-07-04');
  });
});

// ---------------------------------------------------------------------------
// parseAmount
// ---------------------------------------------------------------------------
describe('parseAmount', () => {
  test('parses positive amount', () => {
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56);
  });

  test('parses negative with minus sign', () => {
    expect(parseAmount('-500.00')).toBeCloseTo(-500);
  });

  test('parses negative with parentheses', () => {
    expect(parseAmount('(250.00)')).toBeCloseTo(-250);
  });

  test('returns 0 for empty', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount(null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseQIF — Bank account
// ---------------------------------------------------------------------------
describe('parseQIF — Bank account', () => {
  const qif = `!Type:Bank
D1/15/2024
T-150.00
PGrocery Store
MGroceries for January
LFood:Groceries
N1001
C*
^
D1/20/2024
T2500.00
PSalary Direct Deposit
LIncome:Salary
^
`;

  let result;
  beforeAll(() => { result = parseQIF(qif); });

  test('creates one account', () => {
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].type).toBe('Bank');
  });

  test('parses two transactions', () => {
    expect(result.accounts[0].transactions).toHaveLength(2);
  });

  test('first transaction fields', () => {
    const tx = result.accounts[0].transactions[0];
    expect(tx.date).toBe('2024-01-15');
    expect(tx.amount).toBeCloseTo(-150);
    expect(tx.payee).toBe('Grocery Store');
    expect(tx.memo).toBe('Groceries for January');
    expect(tx.category).toBe('Food:Groceries');
    expect(tx.checkNum).toBe('1001');
    expect(tx.cleared).toBe('*');
  });

  test('second transaction fields', () => {
    const tx = result.accounts[0].transactions[1];
    expect(tx.date).toBe('2024-01-20');
    expect(tx.amount).toBeCloseTo(2500);
    expect(tx.payee).toBe('Salary Direct Deposit');
    expect(tx.category).toBe('Income:Salary');
  });
});

// ---------------------------------------------------------------------------
// parseQIF — CCard account
// ---------------------------------------------------------------------------
describe('parseQIF — CCard account', () => {
  const qif = `!Type:CCard
D2/1/2024
T-45.99
PAmazon
MBook purchase
LBooks
^
`;

  test('sets account type to CCard', () => {
    const result = parseQIF(qif);
    expect(result.accounts[0].type).toBe('CCard');
    expect(result.accounts[0].transactions[0].amount).toBeCloseTo(-45.99);
  });
});

// ---------------------------------------------------------------------------
// parseQIF — Cash account
// ---------------------------------------------------------------------------
describe('parseQIF — Cash account', () => {
  const qif = `!Type:Cash
D3/5/2024
T-20.00
PCoffee Shop
^
`;

  test('sets account type to Cash', () => {
    const result = parseQIF(qif);
    expect(result.accounts[0].type).toBe('Cash');
  });
});

// ---------------------------------------------------------------------------
// parseQIF — Splits
// ---------------------------------------------------------------------------
describe('parseQIF — Split transactions', () => {
  const qif = `!Type:Bank
D4/10/2024
T-200.00
PSupermarket
SFood:Groceries
EWeekly groceries
$-120.00
SHousehold:Supplies
EHousehold items
$-80.00
^
`;

  let tx;
  beforeAll(() => {
    const result = parseQIF(qif);
    tx = result.accounts[0].transactions[0];
  });

  test('parses two splits', () => {
    expect(tx.splits).toHaveLength(2);
  });

  test('first split', () => {
    expect(tx.splits[0].category).toBe('Food:Groceries');
    expect(tx.splits[0].memo).toBe('Weekly groceries');
    expect(tx.splits[0].amount).toBeCloseTo(-120);
  });

  test('second split', () => {
    expect(tx.splits[1].category).toBe('Household:Supplies');
    expect(tx.splits[1].memo).toBe('Household items');
    expect(tx.splits[1].amount).toBeCloseTo(-80);
  });
});

// ---------------------------------------------------------------------------
// parseQIF — Investment account
// ---------------------------------------------------------------------------
describe('parseQIF — Investment account', () => {
  const qif = `!Type:Invst
D3/15/2024
NBuy
YAAPL
I185.50
Q10
T-1855.00
O7.99
MBuy Apple stock
^
D3/20/2024
NSell
YAAPL
I192.00
Q5
T960.00
O7.99
MSell half Apple position
^
`;

  let account;
  beforeAll(() => {
    const result = parseQIF(qif);
    account = result.accounts[0];
  });

  test('sets account type to Invst', () => {
    expect(account.type).toBe('Invst');
  });

  test('parses two investment transactions', () => {
    expect(account.transactions).toHaveLength(2);
  });

  test('buy transaction fields', () => {
    const tx = account.transactions[0];
    expect(tx.date).toBe('2024-03-15');
    expect(tx.action).toBe('Buy');
    expect(tx.security).toBe('AAPL');
    expect(tx.price).toBeCloseTo(185.5);
    expect(tx.quantity).toBeCloseTo(10);
    expect(tx.amount).toBeCloseTo(-1855);
    expect(tx.commission).toBeCloseTo(7.99);
    expect(tx.memo).toBe('Buy Apple stock');
  });

  test('sell transaction fields', () => {
    const tx = account.transactions[1];
    expect(tx.action).toBe('Sell');
    expect(tx.quantity).toBeCloseTo(5);
    expect(tx.amount).toBeCloseTo(960);
  });
});

// ---------------------------------------------------------------------------
// parseQIF — Multiple named accounts (via !Account)
// ---------------------------------------------------------------------------
describe('parseQIF — Multiple accounts', () => {
  const qif = `!Account
NChecking
TBank
^
!Type:Bank
D1/1/2024
T-50.00
PCorner Store
^
!Account
NSavings
TBank
^
!Type:Bank
D1/2/2024
T1000.00
PTransfer from Checking
^
`;

  let result;
  beforeAll(() => { result = parseQIF(qif); });

  test('creates two accounts', () => {
    expect(result.accounts).toHaveLength(2);
  });

  test('first account is Checking', () => {
    expect(result.accounts[0].name).toBe('Checking');
    expect(result.accounts[0].transactions).toHaveLength(1);
  });

  test('second account is Savings', () => {
    expect(result.accounts[1].name).toBe('Savings');
    expect(result.accounts[1].transactions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// parseQIF — Oth A and Oth L account types
// ---------------------------------------------------------------------------
describe('parseQIF — Other Asset and Liability types', () => {
  test('Oth A maps to OthA', () => {
    const qif = `!Type:Oth A\nD1/1/2024\nT5000.00\nPOpening Balance\n^\n`;
    const result = parseQIF(qif);
    expect(result.accounts[0].type).toBe('OthA');
  });

  test('Oth L maps to OthL', () => {
    const qif = `!Type:Oth L\nD1/1/2024\nT-10000.00\nPMortgage\n^\n`;
    const result = parseQIF(qif);
    expect(result.accounts[0].type).toBe('OthL');
  });
});
