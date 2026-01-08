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

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, payer_id INTEGER, amount REAL, description TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, from_id INTEGER, to_id INTEGER, amount REAL, date TEXT)`);
});

app.get('/api/trips', (req, res) => {
    db.all(`SELECT * FROM trips ORDER BY rowid DESC`, (err, rows) => res.json(rows || []));
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
            db.all(`SELECT * FROM expenses WHERE trip_id = ?`, [tripId], (err, expenses) => {
                db.all(`SELECT * FROM transfers WHERE trip_id = ?`, [tripId], (err, transfers) => {
                    
                    // Считаем балансы
                    let balances = {};
                    participants.forEach(p => balances[p.id] = 0);
                    expenses.forEach(e => {
                        balances[e.payer_id] += e.amount;
                        const share = e.amount / participants.length;
                        participants.forEach(p => balances[p.id] -= share);
                    });
                    transfers.forEach(t => {
                        balances[t.from_id] += t.amount;
                        balances[t.to_id] -= t.amount;
                    });

                    res.json({ trip, participants, expenses, transfers, balances });
                });
            });
        });
    });
});

app.post('/api/trips/:id/participants', (req, res) => {
    db.run(`INSERT INTO participants (trip_id, name) VALUES (?, ?)`, [req.params.id, req.body.name], () => res.json({ success: true }));
});

app.post('/api/trips/:id/expenses', (req, res) => {
    const { payer_id, amount, description, date } = req.body;
    db.run(`INSERT INTO expenses (trip_id, payer_id, amount, description, date) VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, payer_id, amount, description, date], () => res.json({ success: true }));
});

app.post('/api/trips/:id/transfers', (req, res) => {
    const { from_id, to_id, amount, date } = req.body;
    db.run(`INSERT INTO transfers (trip_id, from_id, to_id, amount, date) VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, from_id, to_id, amount, date], () => res.json({ success: true }));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
