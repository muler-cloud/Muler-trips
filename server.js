const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Настройка подключения к базе данных с обходом ошибки сертификата
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Это КРИТИЧЕСКИЙ параметр для исправления ошибки "self-signed certificate"
    rejectUnauthorized: false 
  },
  connectionTimeoutMillis: 10000,
});

// Проверка подключения и создание таблиц
async function initDB() {
  try {
    const client = await pool.connect();
    console.log("✅ Успешное подключение к Supabase!");
    
    await client.query(`CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, name TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS participants (id SERIAL PRIMARY KEY, trip_id TEXT, name TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, trip_id TEXT, payer_id INTEGER, amount REAL, description TEXT, date TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS transfers (id SERIAL PRIMARY KEY, trip_id TEXT, from_id INTEGER, to_id INTEGER, amount REAL, date TEXT)`);
    
    console.log("✅ Таблицы проверены и готовы к работе");
    client.release();
  } catch (err) {
    console.error("❌ Ошибка инициализации базы данных:", err.message);
  }
}
initDB();

// Список всех поездок
app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Создание новой поездки
app.post('/api/trips', async (req, res) => {
  try {
    const id = uuidv4();
    const { name } = req.body;
    await pool.query('INSERT INTO trips (id, name) VALUES ($1, $2)',
