const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Подключение к базе с исправлением ошибки сертификата
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false 
  },
  connectionTimeoutMillis: 10000,
});

// Инициализация базы
async function initDB() {
  try {
    const client = await pool.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, name TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS participants (id SERIAL PRIMARY KEY, trip_id TEXT, name TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, trip_id TEXT, payer_id INTEGER, amount REAL, description TEXT, date TEXT)`);
    console.log("✅ База данных готова");
    client.release();
  } catch (err) {
    console.error("❌ Ошибка БД:", err.message);
  }
}
initDB();

app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips', async (req, res) => {
  try {
    const id = uuidv4();
    await pool.query('INSERT INTO trips (id, name) VALUES ($1, $2)', [id, req.body.name]);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips/:id', async (req, res) => {
  try {
    const tripId = req.params.id;
    const trip = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    if (trip.rows.length === 0) return res.status(404).send("Not found");
    const participants = await pool.query('SELECT * FROM participants WHERE trip_id = $1', [tripId]);
    const expenses = await pool.query('SELECT * FROM expenses WHERE trip_id = $1', [tripId]);
    
    let balances = {};
    participants.rows.forEach(p => balances[p.id] = 0);
    expenses.rows.forEach(e => {
      balances[e.payer_id] = (balances[e.payer_id] || 0) + e.amount;
      const share = e.amount / (participants.rows.length || 1);
      participants.rows.forEach(p => balances[p.id] -= share);
    });

    res.json({ trip: trip.rows[0], participants: participants.rows, expenses: expenses.rows, balances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips/:id/participants', async (req, res) => {
  try {
    await pool.query('INSERT INTO participants (trip_id, name) VALUES ($1, $2)', [req.params.id, req.body.name]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips/:id/expenses', async (req, res) => {
  try {
    const { payer_id, amount, description, date } = req.body;
    await pool.query('INSERT INTO expenses (trip_id, payer_id, amount, description, date) VALUES ($1, $2, $3, $4, $5)', 
      [req.params.id, payer_id, amount, description, date]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trips/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM trips WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));

// КОНЕЦ ФАЙЛА - Убедись, что эта строка последняя
