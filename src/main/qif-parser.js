/**
 * QIF (Quicken Interchange Format) parser.
 * Supports account types: Bank, CCard, Cash, Oth A, Oth L, Invst
 */

const ACCOUNT_TYPE_MAP = {
  'Bank': 'Bank',
  'CCard': 'CCard',
  'Cash': 'Cash',
  'Oth A': 'OthA',
  'Oth L': 'OthL',
  'Invst': 'Invst',
  'Investment': 'Invst',
};

/**
 * Parse a QIF date string into ISO format (YYYY-MM-DD).
 * QIF dates can be: M/D/Y, M/D'Y, D-M-Y, D.M.Y, YYYY-MM-DD
 */
function parseDate(raw) {
  if (!raw) return null;
  raw = raw.trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // M/D/Y or M/D'Y (US format)
  let m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.'"](\d{2,4})$/);
  if (m) {
    let [, month, day, year] = m;
    if (year.length === 2) year = parseInt(year) >= 50 ? '19' + year : '20' + year;
    return `${year.padStart(4,'0')}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  }

  return null;
}

/**
 * Parse an amount string: remove commas, handle parentheses as negative.
 */
function parseAmount(raw) {
  if (!raw) return 0;
  raw = raw.trim();
  const negative = raw.startsWith('-') || (raw.startsWith('(') && raw.endsWith(')'));
  raw = raw.replace(/[(),\s]/g, '').replace(/^-/, '');
  const value = parseFloat(raw) || 0;
  return negative ? -value : value;
}

/**
 * Parse a single transaction record (array of field lines) for a non-investment account.
 */
function parseBankRecord(lines) {
  const tx = {
    date: null,
    amount: 0,
    payee: null,
    memo: null,
    category: null,
    checkNum: null,
    cleared: null,
    splits: [],
  };

  let currentSplit = null;

  for (const line of lines) {
    if (line.length === 0) continue;
    const code = line[0];
    const value = line.slice(1);

    switch (code) {
      case 'D': tx.date = parseDate(value); break;
      case 'T': tx.amount = parseAmount(value); break;
      case 'U': if (tx.amount === 0) tx.amount = parseAmount(value); break; // alternate amount
      case 'P': tx.payee = value.trim(); break;
      case 'M': tx.memo = value.trim(); break;
      case 'L': tx.category = value.trim(); break;
      case 'N': tx.checkNum = value.trim(); break;
      case 'C': tx.cleared = value.trim(); break;
      case 'S':
        // Start of a new split — category
        currentSplit = { category: value.trim(), memo: null, amount: 0 };
        tx.splits.push(currentSplit);
        break;
      case 'E':
        // Split memo
        if (currentSplit) currentSplit.memo = value.trim();
        break;
      case '$':
        // Split amount
        if (currentSplit) currentSplit.amount = parseAmount(value);
        break;
      default:
        break;
    }
  }

  return tx;
}

/**
 * Parse a single investment transaction record.
 */
function parseInvstRecord(lines) {
  const tx = {
    date: null,
    action: null,
    security: null,
    price: 0,
    quantity: 0,
    amount: 0,
    commission: 0,
    memo: null,
    cleared: null,
    transferAccount: null,
    transferAmount: 0,
  };

  for (const line of lines) {
    if (line.length === 0) continue;
    const code = line[0];
    const value = line.slice(1);

    switch (code) {
      case 'D': tx.date = parseDate(value); break;
      case 'N': tx.action = value.trim(); break;
      case 'Y': tx.security = value.trim(); break;
      case 'I': tx.price = parseAmount(value); break;
      case 'Q': tx.quantity = parseAmount(value); break;
      case 'T': tx.amount = parseAmount(value); break;
      case 'U': if (tx.amount === 0) tx.amount = parseAmount(value); break;
      case 'O': tx.commission = parseAmount(value); break;
      case 'M': tx.memo = value.trim(); break;
      case 'C': tx.cleared = value.trim(); break;
      case 'L': tx.transferAccount = value.trim(); break;
      case '$': tx.transferAmount = parseAmount(value); break;
      default:
        break;
    }
  }

  return tx;
}

/**
 * Parse a QIF file string into a structured object.
 *
 * Returns:
 * {
 *   accounts: [{ name, type, transactions: [...] }]
 * }
 */
function parseQIF(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const accounts = [];
  let currentAccount = null;
  let currentAccountType = null;
  let recordLines = [];

  function pushRecord() {
    if (recordLines.length === 0 || recordLines.every(l => l.trim() === '')) {
      recordLines = [];
      return;
    }
    if (!currentAccount) {
      // Records before any account header use a default account
      currentAccount = { name: 'Default', type: currentAccountType || 'Bank', transactions: [] };
      accounts.push(currentAccount);
    }
    const isInvst = currentAccount.type === 'Invst';
    const tx = isInvst ? parseInvstRecord(recordLines) : parseBankRecord(recordLines);
    currentAccount.transactions.push(tx);
    recordLines = [];
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('!Type:')) {
      const typeName = line.slice(6).trim();
      currentAccountType = ACCOUNT_TYPE_MAP[typeName] || typeName;

      // If we have an open account, update its type if not yet set
      if (currentAccount && currentAccount.type === 'Unknown') {
        currentAccount.type = currentAccountType;
      } else if (!currentAccount) {
        // Will be created on first record push
      }
    } else if (line.startsWith('!Account')) {
      // Account header section follows
      pushRecord();
      const accountFields = {};
      i++;
      while (i < lines.length && lines[i] !== '^') {
        const al = lines[i];
        if (al.startsWith('N')) accountFields.name = al.slice(1).trim();
        if (al.startsWith('T')) accountFields.type = ACCOUNT_TYPE_MAP[al.slice(1).trim()] || al.slice(1).trim();
        i++;
      }
      currentAccount = {
        name: accountFields.name || 'Unnamed',
        type: accountFields.type || currentAccountType || 'Bank',
        transactions: [],
      };
      accounts.push(currentAccount);
    } else if (line === '^') {
      pushRecord();
    } else if (line.startsWith('!')) {
      // Other directives — skip
    } else {
      recordLines.push(line);
    }

    i++;
  }

  // Handle trailing record without '^'
  pushRecord();

  return { accounts };
}

module.exports = { parseQIF, parseDate, parseAmount };
