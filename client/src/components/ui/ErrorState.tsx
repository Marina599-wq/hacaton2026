import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-center">
      <AlertTriangle size={20} className="text-red-500" />
      <p className="text-sm text-red-700">{error.message || 'Что-то пошло не так'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
