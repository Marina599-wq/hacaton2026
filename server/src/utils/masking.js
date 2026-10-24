// Обезличивание контрагентов (ТЗ-доп. §3): полные ИНН/названия не сохраняются.
export function maskName(name) {
  if (!name) return null;
  const clean = String(name).trim();
  if (clean.length <= 2) return `${clean[0] ?? ''}***`;
  return `${clean.slice(0, 2)}***`;
}

// "7701234512" → "77******12" (первые 2 цифры + ****** + последние 2)
export function maskInn(inn) {
  if (!inn) return null;
  const digits = String(inn).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
}

// Последние 2 видимые цифры маскированного ИНН ("77******12" → "12")
export function innSuffix(innMasked) {
  if (!innMasked) return null;
  const m = String(innMasked).match(/(\d{2})$/);
  return m ? m[1] : null;
}
