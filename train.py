import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
import joblib
import warnings
import os
import zipfile

warnings.filterwarnings('ignore')

def extract_features(history_df, current_balance):
    incomes = history_df[history_df['direction'] == 'Поступление']['amount'].sum()
    expenses = history_df[history_df['direction'] == 'Списание']['amount'].sum()
    expenses_std = history_df[history_df['direction'] == 'Списание']['amount'].std()
    
    return [
        current_balance,
        incomes - expenses,
        0 if np.isnan(expenses_std) else expenses_std,
        expenses / 30 if expenses > 0 else 0
    ]

if __name__ == '__main__':
    print("Текущая папка:", os.getcwd())
    print("Файлы в папке:", os.listdir('.'))
    
    df = None
    
    try:
        if os.path.exists('all_operations.csv'):
            print("Читаем распакованный all_operations.csv...")
            df = pd.read_csv('all_operations.csv', sep=';', encoding='utf-8')
        elif os.path.exists('cashflow_dataset_participants.zip'):
            print("Читаем all_operations.csv прямо из архива...")
            with zipfile.ZipFile('cashflow_dataset_participants.zip', 'r') as z:
                with z.open('all_operations.csv') as f:
                    df = pd.read_csv(f, sep=';', encoding='utf-8')
        else:
            print("\n❌ ОШИБКА: Файл с данными не найден!")
            print("Пожалуйста, просто скопируйте архив cashflow_dataset_participants.zip в папку ML.")
            exit()
            
        df['operation_date'] = pd.to_datetime(df['operation_date'])
        
        X, y = [], []
        print("Подготовка признаков...")
        for company_id, group in df.groupby('company_id'):
            group = group.sort_values('operation_date')
            days = group['operation_date'].unique()
            
            if len(days) < 60: 
                continue
                
            for i in range(30, len(days) - 30, 10):
                cutoff = days[i]
                history = group[group['operation_date'] < cutoff].tail(100)
                future = group[(group['operation_date'] >= cutoff) & (group['operation_date'] < days[i+30])]
                
                if history.empty or future.empty: 
                    continue
                    
                current_balance = history['balance_eod'].iloc[-1]
                X.append(extract_features(history, current_balance))
                y.append(1 if future['balance_eod'].min() < 0 else 0)

        print(f"Обучение модели на {len(X)} примерах...")
        model = RandomForestClassifier(n_estimators=100, max_depth=6, class_weight='balanced', random_state=42)
        model.fit(X, y)
        
        joblib.dump(model, 'cashflow_model.pkl')
        print("✅ Успех! Модель cashflow_model.pkl сохранена.")
        
    except Exception as e:
        print("❌ Произошла ошибка при чтении или обучении:", e)