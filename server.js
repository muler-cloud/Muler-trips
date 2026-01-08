const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Подключение к MongoDB
const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('travel_split_app');
        console.log("✅ Успешно подключено к MongoDB Atlas!");
    } catch (e) {
        console.error("❌ Ошибка подключения к MongoDB:", e.message);
    }
}
connectDB();

// 1. Получить все поездки
app.get('/api/trips', async (req, res) => {
    try {
        if (!db) return res.json([]);
        const trips = await db.collection('trips').find().sort({ _id: -1 }).toArray();
        res.json(trips || []);
    } catch (err) {
        console.error("Ошибка GET /api/trips:", err.message);
        res.json([]);
    }
});

// 2. Создать поездку
app.post('/api/trips', async (req, res) => {
    try {
        const id = uuidv4();
        const { name } = req.body;
        await db.collection('trips').insertOne({ id, name });
        console.log(`🆕 Создана поездка: ${name} (ID: ${id})`);
        res.json({ id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Детали поездки и расчет баланса
app.get('/api/trips/:id', async (req, res) => {
    try {
        const tripId = req.params.id;
        const trip = await db.collection('trips').findOne({ id: tripId });
        if (!trip) return res.status(404).json({ error: "Trip not found" });

        const participants = await db.collection('participants').find({ trip_id: tripId }).toArray();
        const expenses = await db.collection('expenses').find({ trip_id: tripId }).toArray();

        // Расчет балансов
        let balances = {};
        participants.forEach(p => balances[p.id] = 0);
        
        expenses.forEach(e => {
            const amount = parseFloat(e.amount) || 0;
            // Тот кто платил — в плюсе
            balances[e.payer_id] = (balances[e.payer_id] || 0) + amount;
            // Делим на всех
            const share = amount / (participants.length || 1);
            participants.forEach(p => {
                balances[p.id] = (balances[p.id] || 0) - share;
            });
        });

        res.json({ trip, participants, expenses, balances });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Добавить участника
app.post('/api/trips/:id/participants', async (req, res) => {
    try {
        const participantId = Date.now(); // Используем числовой ID для простоты
        const newParticipant = {
            trip_id: req.params.id,
            id: participantId,
            name: req.body.name
        };
        await db.collection('participants').insertOne(newParticipant);
        console.log(`👤 Добавлен участник: ${req.body.name}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Добавить расход (ИСПРАВЛЕНО)
app.post('/api/trips/:id/expenses', async (req, res) => {
    try {
        const { payer_id, amount, description, date } = req.body;
        
        const newExpense = {
            trip_id: req.params.id,
            payer_id: payer_id, // Сохраняем как есть (число или строка)
            amount: parseFloat(amount) || 0,
            description: description || "Без названия",
            date: date || new Date().toLocaleDateString('ru-RU'),
            createdAt: new Date()
        };

        await db.collection('expenses').insertOne(newExpense);
        console.log(`💰 Добавлен расход: ${amount} от участника ID ${payer_id}`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Ошибка при сохранении расхода:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 6. Удалить поездку
app.delete('/api/trips/:id', async (req,
