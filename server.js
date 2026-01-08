const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Настройка подключения к Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Важно для работы с Supabase из облака Render
  },
  connectionTimeoutMillis: 10000, // Даем серверу 10 секунд на соединение
});

// Автоматическое создание таблиц в Supabase при запуске
async function initDB() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, name TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS participants (id SERIAL PRIMARY KEY, trip_id TEXT, name TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, trip_id TEXT, payer_id INTEGER, amount REAL, description TEXT, date TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS transfers (id SERIAL PRIMARY KEY, trip_id TEXT, from_id INTEGER, to_id INTEGER, amount REAL, date TEXT)`);
    console.log("✅ Таблицы в Supabase проверены/созданы");
  } catch (err) {
    console.error("❌ Ошибка инициализации базы данных:", err);
  }
}
initDB();

// Получить список всех поездок
app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Создать новую поездку
app.post('/api/trips', async (req, res) => {
  try {
    const id = uuidv4();
    await pool.query('INSERT INTO trips (id, name) VALUES ($1, $2)', [id, req.body.name]);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить детали конкретной поездки
app.get('/api/trips/:id', async (req, res) => {
  try {
    const tripId = req.params.id;
    const trip = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    if (trip.rows.length === 0) return res.status(404).send("Поездка не найдена");
    
    const participants = await pool.query('SELECT * FROM participants WHERE trip_id = $1', [tripId]);
    const expenses = await pool.query('SELECT * FROM expenses WHERE trip_id = $1', [tripId]);
    const transfers = await pool.query('SELECT * FROM transfers WHERE trip_id = $1', [tripId]);
    
    // Расчет баланса
    let balances = {};
    participants.rows.forEach(p => balances[p.id] = 0);
    
    expenses.rows.forEach(e => {
      balances[e.payer_id] = (balances[e.payer_id] || 0) + e.amount;
      const share = e.amount / participants.rows.length;
      participants.rows.forEach(p => balances[p.id] -= share);
    });
    
    transfers.rows.forEach(t => {
      balances[t.from_id] = (balances[t.from_id] || 0) + t.amount;
      balances[t.to_id] = (balances[t.to_id] || 0) - t.amount;
    });

    res.json({ 
      trip: trip.rows[0], 
      participants: participants.rows, 
      expenses: expenses.rows, 
      balances 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить участника
app.post('/api/trips/:id/participants', async (req, res) => {
  try {
    await pool.query('INSERT INTO participants (trip_id, name) VALUES ($1, $2)', [req.params.id, req.body.name]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить расход
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

// Удалить поездку
app.delete('/api/trips/:id', async (req, res) => {
  try {
    const tripId = req.params.id;
    await pool.query('DELETE FROM trips WHERE id = $1', [tripId]);
    await pool.query('DELETE FROM participants WHERE trip_id = $1', [tripId]);
    await pool.query('DELETE FROM expenses WHERE trip_id = $1', [tripId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен. Порт: ${PORT}`));
