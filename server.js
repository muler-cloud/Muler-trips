const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Подключение к MongoDB через переменную MONGODB_URI
const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('travel_split_app');
        console.log("✅ Успешное подключение к MongoDB Atlas!");
    } catch (e) {
        console.error("❌ Ошибка подключения к MongoDB:", e.message);
    }
}
connectDB();

// API: Получить список поездок
app.get('/api/trips', async (req, res) => {
    try {
        if (!db) return res.json([]);
        const trips = await db.collection('trips').find().sort({_id: -1}).toArray();
        res.json(trips || []);
    } catch (err) {
        res.json([]);
    }
});

// API: Создать поездку
app.post('/api/trips', async (req, res) => {
    try {
        const id = uuidv4();
        await db.collection('trips').insertOne({ id, name: req.body.name });
        res.json({ id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Детали поездки
app.get('/api/trips/:id', async (req, res) => {
    try {
        const tripId = req.params.id;
        const trip = await db.collection('trips').findOne({ id: tripId });
        if (!trip) return res.status(404).json({ error: "Не найдено" });

        const participants = await db.collection('participants').find({ trip_id: tripId }).toArray();
        const expenses = await db.collection('expenses').find({ trip_id: tripId }).toArray();

        // Расчет баланса
        let balances = {};
        participants.forEach(p => balances[p.id] = 0);
        expenses.forEach(e => {
            balances[e.payer_id] = (balances[e.payer_id] || 0) + e.amount;
            const share = e.amount / (participants.length || 1);
            participants.forEach(p => balances[p.id] -= share);
        });

        res.json({ trip, participants, expenses, balances });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Добавить участника
app.post('/api/trips/:id/participants', async (req, res) => {
    try {
        const p_id = Date.now();
        await db.collection('participants').insertOne({ trip_id: req.params.id, id: p_id, name: req.body.name });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));
