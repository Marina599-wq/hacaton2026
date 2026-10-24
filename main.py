from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import pandas as pd
import joblib
import numpy as np
import io
import os

app = FastAPI(title="Cashflow ML Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Загружаем нашу модель
model = joblib.load('cashflow_model.pkl')

class ChatRequest(BaseModel):
    question: str
    incomes: float
    expenses: float
    probability: float

# Отдаем клиентский интерфейс
@app.get("/", response_class=HTMLResponse)
async def root():
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Файл index.html не найден! Создайте его в папке ML.</h1>"

# Эндпоинт для загрузки файла и получения ML-прогноза
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        content = await file.read()
        # Пробуем разные кодировки и разделители
        try:
            df = pd.read_csv(io.BytesIO(content), sep=';', encoding='utf-8')
        except:
            df = pd.read_csv(io.BytesIO(content), sep=',', encoding='windows-1251')
            
        if df.empty:
            return {"status": "error", "message": "Файл пуст"}

        incomes = df[df['direction'] == 'Поступление']['amount'].sum()
        if incomes == 0: # Поддержка английских ключей
            incomes = df[df['direction'] == 'in']['amount'].sum()
            
        expenses = df[df['direction'] == 'Списание']['amount'].sum()
        if expenses == 0:
            expenses = df[df['direction'] == 'out']['amount'].sum()
            
        out_df = df[df['direction'].isin(['Списание', 'out'])]
        expenses_std = out_df['amount'].std() if len(out_df) > 1 else 0.0
        
        currentBalance = df['balance_eod'].iloc[-1] if 'balance_eod' in df.columns else 100000

        features = [[
            currentBalance,
            incomes - expenses,
            0 if pd.isna(expenses_std) else expenses_std,
            expenses / 30 if expenses > 0 else 0
        ]]
        
        probability = model.predict_proba(features)[0][1]
        
        return {
            "status": "success",
            "probabilityPct": round(probability * 100, 1),
            "stats": {
                "incomes": float(incomes),
                "expenses": float(expenses),
                "balance": float(currentBalance)
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Эндпоинт ML-чата (анализирует вопрос и контекст датасета)
@app.post("/api/chat")
async def chat_with_ml(req: ChatRequest):
    q = req.question.lower()
    
    if "разрыв" in q or "риск" in q:
        if req.probability > 50:
            ans = f"⚠️ Риск кассового разрыва очень высок: {req.probability}%. Рекомендую сократить внеплановые траты."
        elif req.probability > 20:
            ans = f"🟡 Риск разрыва средний: {req.probability}%. Возможны кратковременные просадки."
        else:
            ans = f"✅ Риск кассового разрыва минимален ({req.probability}%). Финансовое состояние стабильно."
    elif "доход" in q or "заработ" in q or "поступлен" in q:
        ans = f"Общая сумма поступлений за загруженный период составила {req.incomes:,.2f} ₽."
    elif "расход" in q or "трат" in q or "списан" in q:
        ans = f"Общая сумма списаний за загруженный период составила {req.expenses:,.2f} ₽."
    elif "баланс" in q or "итог" in q:
        net = req.incomes - req.expenses
        ans = f"Чистый денежный поток: {net:,.2f} ₽. Риск разрыва ML оценивает в {req.probability}%."
    else:
        ans = "Я анализирую финансовые потоки. Спросите меня про доходы, расходы, баланс или риск кассового разрыва по загруженным данным."
        
    return {"answer": ans}