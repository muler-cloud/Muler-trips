const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = process.env.RENDER_DISK_PATH 
    ? path.join(process.env.RENDER_DISK_PATH, 'tripdata.db') 
    : './tripdata.db';

const db = new sqlite3.Database(dbPath);

// Инициализация базы
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, payer_id INTEGER, amount REAL, description TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, from_id INTEGER, to_id INTEGER, amount REAL, date TEXT)`);
});

// Получить все поездки
app.get('/api/trips', (req, res) => {
    db.all(`SELECT * FROM trips ORDER BY rowid DESC`, (err, rows) => res.json(rows || []));
});

// Создать поездку
app.post('/api/trips', (req, res) => {
    const id = uuidv4();
    db.run(`INSERT INTO trips (id, name) VALUES (?, ?)`, [id, req.body.name], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ id });
    });
});

// Получить одну поездку
app.get('/api/trips/:id', (req, res) => {
    const tripId = req.params.id;
    db.get(`SELECT * FROM trips WHERE id = ?`, [tripId], (err, trip) => {
        if (!trip) return res.status(404).send("Not found");
        db.all(`SELECT * FROM participants WHERE trip_id = ?`, [tripId], (err, participants) => {
            res.json({ trip, participants: participants || [], expenses: [], transfers: [], balances: {} });
        });
    });
});

// Маршрут для добавления участников (минимум для работы)
app.post('/api/trips/:id/participants', (req, res) => {
    db.run(`INSERT INTO participants (trip_id, name) VALUES (?, ?)`, [req.params.id, req.body.name], (err) => res.json({ success: true }));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
