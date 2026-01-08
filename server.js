const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();

// ПАРОЛЬ
const MY_PASSWORD = '0355'; 

// Важно: эти строки заменяют body-parser и работают всегда
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = process.env.RENDER_DISK_PATH 
    ? path.join(process.env.RENDER_DISK_PATH, 'tripdata.db') 
    : './tripdata.db';

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, payer_id INTEGER, amount REAL, description TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, from_id INTEGER, to_id INTEGER, amount REAL, date TEXT)`);
});

// ПРОВЕРКА ПАРОЛЯ С ЛОГАМИ
app.post('/api/login', (req, res) => {
    const receivedPass = req.body.password;
    console.log("LOG: Попытка входа. Получено:", receivedPass, "Ожидалось:", MY_PASSWORD);
    
    if (String(receivedPass) === String(MY_PASSWORD)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Wrong password' });
    }
});

// Все остальные API (кратко для проверки)
app.get('/api/trips', (req, res) => {
    db.all(`SELECT * FROM trips`, (err, rows) => res.json(rows || []));
});

app.post('/api/trips', (req, res) => {
    const id = uuidv4();
    db.run(`INSERT INTO trips (id, name) VALUES (?, ?)`, [id, req.body.name], () => res.json({ id }));
});

app.get('/api/trips/:id', (req, res) => {
    const tripId = req.params.id;
    db.get(`SELECT * FROM trips WHERE id = ?`, [tripId], (err, trip) => {
        if (!trip) return res.status(404).send("Not found");
        db.all(`SELECT * FROM participants WHERE trip_id = ?`, [tripId], (err, participants) => {
            res.json({ trip, participants: participants || [], expenses: [], transfers: [], balances: {} });
        });
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
