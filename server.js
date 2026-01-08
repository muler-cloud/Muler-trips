const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('travel_db');
        console.log("✅ Успешно подключено к MongoDB Atlas!");
    } catch (e) {
        console.error("❌ Ошибка подключения к MongoDB:", e);
    }
}
connectDB();

app.get('/api/trips', async (req, res) => {
    const trips = await db.collection('trips').find().sort({_id: -1}).toArray();
    res.json(trips);
});

app.post('/api/trips', async (req, res) => {
    const id = uuidv4();
    await db.collection('trips').insertOne({ id, name: req.body.name });
    res.json({ id });
});

app.get('/api/trips/:id', async (req, res) => {
    const trip = await db.collection('trips').findOne({ id: req.params.id });
    const participants = await db.collection('participants').find({ trip_id: req.params.id }).toArray();
    const expenses = await db.collection('expenses').find({ trip_id: req.params.id }).toArray();
    
    // Баланс считаем как и раньше
    let balances = {};
    participants.forEach(p => balances[p.id] = 0);
    expenses.forEach(e => {
        balances[e.payer_id] = (balances[e.payer_id] || 0) + e.amount;
        const share = e.amount / (participants.length || 1);
        participants.forEach(p => balances[p.id] -= share);
    });
    res.json({ trip, participants, expenses, balances });
});

app.post('/api/trips/:id/participants', async (req, res) => {
    await db.collection('participants').insertOne({ trip_id: req.params.id, id: Date.now(), name: req.body.name });
    res.json({ success: true });
});

app.post('/api/trips/:id/expenses', async (req, res) => {
    await db.collection('expenses').insertOne({ 
        trip_id: req.params.id, 
        payer_id: req.body.payer_id, 
        amount: parseFloat(req.body.amount), 
        description: req.body.description, 
        date: req.body.date 
    });
    res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));
