// server/src/utils/anonymizer.js
export function anonymizeCounterparty(name, inn) {
  const maskedName = name.length > 2 ? name.substring(0, 2) + '***' : '***';
  const maskedInn = inn.length > 4 ? inn.substring(0, 2) + '******' + inn.substring(inn.length - 2) : '**********';
  
  return {
    name: maskedName,
    inn: maskedInn
  };
}