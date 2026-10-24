// Паттерн Adapter для внешних источников (ТЗ-доп. §5):
// каждый провайдер возвращает массив черновиков PlannedEvent (без userId — проставляет контроллер).
//
// Контракт:
//   sync(ctx: { userId, now, operations }) => Array<PlannedEventDraft>
//
// Ограничения: только детерминированные генераторы (mock), без реальных API и OAuth.
export class BaseAdapter {
  constructor(code, label) {
    this.code = code;
    this.label = label;
  }
  // eslint-disable-next-line no-unused-vars
  async sync() {
    throw new Error('adapter.sync() not implemented');
  }
}
