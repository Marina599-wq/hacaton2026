// Детерминированные генераторы синхронизации (ТЗ-доп. §5). Даты привязаны к текущему месяцу/году.
import { BaseAdapter } from './adapter.interface.js';

const dayUtc = (y, m, d) => new Date(Date.UTC(y, m, d));
const nowCtx = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const todayD = now.getUTCDate();
  return { y, m, todayD };
};

// Ближайший понедельник (today + N дн.), если сегодня — понедельник, то он сам
function nextMonday(fromDayIdx) {
  const d = new Date(fromDayIdx * 86400000);
  const wd = d.getUTCDay(); // 0 = вс
  const add = wd === 1 ? 0 : (8 - wd) % 7 || 7;
  return new Date(d.getTime() + add * 86400000);
}

class OneCAdapter extends BaseAdapter {
  async sync() {
    const { y, m, todayD } = nowCtx();
    // 1) 20-е число тек. месяца (если прошло — след.): счёт поставщику 95 000 ₽
    const invoiceDay = dayUtc(y, m, 20).getTime() > Date.now() ? dayUtc(y, m, 20) : dayUtc(y, (m + 1) % 12 === 0 ? 0 : m + 1, 20);
    // 2) 22-е число: договор логистики 60 000 ₽
    const contractDay = dayUtc(y, m, 22).getTime() > Date.now() ? dayUtc(y, m, 22) : dayUtc(y, (m + 1) % 12 === 0 ? 0 : m + 1, 22);
    return [
      { type: 'invoice', title: 'Счёт №88 за закупку материалов', amount: 95000, direction: 'out',
        expectedDate: invoiceDay, issueDate: dayUtc(y, m, todayD), deferralDays: 0,
        counterpartyName: 'По***', counterpartyInn: '50******34', counterpartyRisk: 'low', source: '1c',
        status: 'pending', active: true },
      { type: 'contract', title: 'Договор логистики №19', amount: 60000, direction: 'out',
        expectedDate: contractDay, issueDate: dayUtc(y, m, todayD), deferralDays: 0,
        counterpartyName: 'Тр***', counterpartyInn: '77******08', counterpartyRisk: 'low', source: '1c',
        status: 'pending', active: true },
    ];
  }
}

class EdoAdapter extends BaseAdapter {
  async sync() {
    const { y, m } = nowCtx();
    return [
      // 25-е: входящий платёж от ненадёжного контрагента — контроллер сам создаст Risk 75%
      { type: 'contract', title: 'Оплата по договору №14 (акт подписан в ЭДО)', amount: 250000, direction: 'in',
        expectedDate: dayUtc(y, m, 25), issueDate: dayUtc(y, m, 11), deferralDays: 14,
        counterpartyName: 'Кл***', counterpartyInn: '77******12', counterpartyRisk: 'high', source: 'edo',
        status: 'pending', active: true },
      // 29-е: счёт за партию товара 110 000 ₽
      { type: 'invoice', title: 'Счёт №104 за партию товара', amount: 110000, direction: 'in',
        expectedDate: dayUtc(y, m, 29), issueDate: dayUtc(y, m, 15), deferralDays: 14,
        counterpartyName: 'Сб***', counterpartyInn: '77******02', counterpartyRisk: 'low', source: 'edo',
        status: 'pending', active: true },
    ];
  }
}

class TaxCalendarAdapter extends BaseAdapter {
  async sync() {
    const { y, m } = nowCtx();
    return [
      { type: 'tax', title: 'ЕНП и аванс по УСН (авторасчёт по календарю ФНС)', amount: 180000, direction: 'out',
        expectedDate: dayUtc(y, m, 28), issueDate: dayUtc(y, m, 1), deferralDays: 0,
        counterpartyName: 'ФН***', counterpartyInn: '77******00', counterpartyRisk: 'low', source: 'tax_calendar',
        status: 'pending', active: true },
    ];
  }
}

class MarketplaceAdapter extends BaseAdapter {
  async sync() {
    const dayIdx = Math.floor(Date.now() / 86400000);
    const monday = nextMonday(dayIdx);
    return [
      { type: 'invoice', title: 'Выплата по еженедельному отчёту о продажах (за вычетом комиссии МП)',
        amount: 84500, direction: 'in', expectedDate: monday, issueDate: new Date(dayIdx * 86400000),
        deferralDays: 0, counterpartyName: 'ВБ***', counterpartyInn: '50******01',
        counterpartyRisk: 'low', source: 'marketplace', status: 'pending', active: true },
    ];
  }
}

export const ADAPTERS = {
  '1c': { adapter: new OneCAdapter('1c', '1С:Бухгалтерия'), label: '1С:Бухгалтерия' },
  edo: { adapter: new EdoAdapter('edo', 'ЭДО (Диадок / СБИС)'), label: 'ЭДО (Диадок / СБИС)' },
  'tax-calendar': { adapter: new TaxCalendarAdapter('tax-calendar', 'Налоговый календарь ФНС'), label: 'Налоговый календарь ФНС' },
  marketplace: { adapter: new MarketplaceAdapter('marketplace', 'Онлайн-кассы и Маркетплейсы'), label: 'Онлайн-кассы и Маркетплейсы (WB / Ozon / ОФД)' },
};

export const PROVIDER_CODES = Object.keys(ADAPTERS);
