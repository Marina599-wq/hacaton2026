// server/src/utils/parser.js
// Парсер банковских выписок.
// Формат А (организаторы, test-data/*.csv): UTF-8 BOM, разделитель ';',
//   company_id;operation_id;operation_date;amount;direction;counterparty_inn;counterparty_name;payment_purpose;balance_eod
//   direction: «Поступление» / «Списание»; ИНН — строка (ведущие нули!), назначение — свободный текст (может содержать ; и кавычки).
// Формат Б (легаси, 7 колонок): Дата;Сумма;Направление;Контрагент;ИНН;Назначение;Остаток — направление in/out.

/** Разбирает одну CSV-строку с учётом кавычек (RFC 4180), разделитель ';'. */
function splitCsvLine(line, delimiter = ';') {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(cur);
      cur = '';
    } else cur += ch;
  }
  fields.push(cur);
  return fields.map(f => f.trim());
}

/** Разбивает текст на CSV-строки с учётом переводов строк внутри кавычек. */
function splitCsvRows(text) {
  const rows = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      rows.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '') rows.push(cur);
  return rows;
}

/** Направление: «Поступление»/in → 'in', «Списание»/out → 'out'. */
function normalizeDirection(raw) {
  const d = String(raw || '').trim().toLowerCase();
  if (['поступление', 'in', 'приход', 'доход'].includes(d)) return 'in';
  if (['списание', 'out', 'расход', 'выбор'].includes(d)) return 'out';
  return null;
}

/** Категория расхода по ключевым словам в назначении платежа. */
function inferCategory(direction, purpose) {
  const p = String(purpose || '').toLowerCase();
  if (direction === 'in') return 'income';
  if (p.includes('зарплат') || p.includes('заработн') || p.includes('оклад') || p.includes('аванс работникам')) return 'salary';
  if (p.includes('налог') || p.includes('енп') || p.includes('страхов')) return 'tax';
  if (p.includes('аренд') || p.includes('кредит') || p.includes('лизинг') || p.includes('комисси') || p.includes('пошлин') || p.includes('банк')) return 'payment';
  return 'expense';
}

function parseDate(raw) {
  const d = String(raw || '').trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  if (iso) return new Date(iso + 'T00:00:00.000Z').toISOString();
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Основной парсер.
 * @returns {Promise<{operations: Array, meta: {format, companyId, rowsTotal, rowsSkipped}, warnings: string[]}>}
 */
export async function parseBankStatement(buffer, filename = '') {
  let text = buffer.toString('utf-8');
  // UTF-8 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = splitCsvRows(text).filter(r => r.trim() !== '');
  if (rows.length === 0) {
    return { operations: [], meta: { format: 'empty', companyId: null, rowsTotal: 0, rowsSkipped: 0 }, warnings: ['Файл пуст'] };
  }

  const header = splitCsvLine(rows[0]).map(h => h.trim());
  const isOrganizerFormat = header.includes('operation_date') || header.some(h => h.toLowerCase().includes('company_id'));

  const warnings = [];
  const operations = [];
  const seen = new Set();
  let rowsTotal = 0;
  let companyId = null;

  const dataRows = isOrganizerFormat ? rows.slice(1) : (rows[0].toLowerCase().includes('дата') ? rows.slice(1) : rows);

  for (let i = 0; i < dataRows.length; i++) {
    rowsTotal++;
    const line = dataRows[i];
    const parts = isOrganizerFormat ? splitCsvLine(line) : splitCsvLine(line, ';');

    if (isOrganizerFormat) {
      // company_id;operation_id;operation_date;amount;direction;counterparty_inn;counterparty_name;payment_purpose;balance_eod
      if (parts.length < 9) { warnings.push(`Строка ${i + 2}: мало полей (${parts.length})`); continue; }
      const [cid, opId, opDate, amount, direction, inn, name, purpose, balanceEod] = parts;
      if (companyId === null) companyId = cid || null;

      const dir = normalizeDirection(direction);
      const date = parseDate(opDate);
      const amt = parseFloat(amount.replace(',', '.'));
      const bal = parseFloat(balanceEod.replace(',', '.'));
      if (!dir) { warnings.push(`Строка ${i + 2}: неизвестное направление «${direction}»`); continue; }
      if (!date) { warnings.push(`Строка ${i + 2}: нераспознана дата «${opDate}»`); continue; }
      if (!Number.isFinite(amt) || amt <= 0) { warnings.push(`Строка ${i + 2}: некорректная сумма «${amount}»`); continue; }
      if (!Number.isFinite(bal)) { warnings.push(`Строка ${i + 2}: некорректный остаток «${balanceEod}»`); continue; }

      // Дедупликация полных дублей (едиичные повторные строки в выгрузках)
      const dedupeKey = [opId, date, amt, dir, bal].join('|');
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      operations.push({
        date,
        amount: amt,
        direction: dir,
        category: inferCategory(dir, purpose),
        counterpartyName: name || 'Не указан',
        counterpartyInn: String(inn || ''),
        purpose: purpose || '',
        balanceEndOfDay: bal,
        externalId: opId || null,
        companyId,
      });
    } else {
      // Легаси: Дата;Сумма;Направление;Контрагент;ИНН;Назначение;Остаток
      if (parts.length < 7) { warnings.push(`Строка ${i + 2}: мало полей (${parts.length})`); continue; }
      const [dateRaw, amountRaw, directionRaw, name, inn, purpose, balanceRaw] = parts;
      const dir = normalizeDirection(directionRaw);
      const date = parseDate(dateRaw);
      const amt = parseFloat(amountRaw.replace(',', '.'));
      const bal = parseFloat(balanceRaw.replace(',', '.'));
      if (!dir || !date || !Number.isFinite(amt) || !Number.isFinite(bal)) {
        warnings.push(`Строка ${i + 2}: не распарсено (${directionRaw}/${dateRaw})`);
        continue;
      }
      operations.push({
        date,
        amount: amt,
        direction: dir,
        category: inferCategory(dir, purpose),
        counterpartyName: name || 'Не указан',
        counterpartyInn: String(inn || ''),
        purpose: purpose || '',
        balanceEndOfDay: bal,
        externalId: null,
        companyId: null,
      });
    }
  }

  return {
    operations,
    meta: {
      format: isOrganizerFormat ? 'organizer' : 'legacy',
      companyId: isOrganizerFormat ? companyId : null,
      rowsTotal,
      rowsSkipped: rowsTotal - operations.length,
    },
    warnings,
  };
}

/** Обёртка для легаси-кода: возвращает массив операций (без мета-информации). */
export async function parseFile(buffer, filename) {
  const { operations } = await parseBankStatement(buffer, filename);
  return operations;
}
