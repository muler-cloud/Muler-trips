const MY_PASSWORD = 'hamsa'; // Впиши сюда свой пароль!

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();

const dbPath = process.env.RENDER_DISK_PATH 
    ? path.join(process.env.RENDER_DISK_PATH, 'tripdata.db') 
    : './tripdata.db';

const db = new sqlite3.Database(dbPath);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, name TEXT, location TEXT, start_date TEXT, end_date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, payer_id INTEGER, amount REAL, description TEXT, date TEXT, split_type TEXT DEFAULT 'equal')`);
    db.run(`CREATE TABLE IF NOT EXISTS expense_shares (expense_id INTEGER, participant_id INTEGER, owed_amount REAL)`);
    db.run(`CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT, from_id INTEGER, to_id INTEGER, amount REAL, date TEXT)`);
});

// Проверка пароля
app.post('/api/login', (req, res) => {
    if (req.body.password === MY_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Неверный пароль' });
    }
});

app.post('/api/trips', (req, res) => {
    const { name, location, start_date, end_date } = req.body;
    const id = uuidv4();
    db.run(`INSERT INTO trips (id, name, location, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
        [id, name, location, start_date, end_date], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id });
        });
});

app.get('/api/trips/:id', (req, res) => {
    const tripId = req.params.id;
    const getTrip = new Promise((res, rej) => db.get(`SELECT * FROM trips WHERE id = ?`, [tripId], (err, r) => err ? rej(err) : res(r)));
    const getParts = new Promise((res, rej) => db.all(`SELECT * FROM participants WHERE trip_id = ?`, [tripId], (err, r) => err ? rej(err) : res(r)));
    const getExps = new Promise((res, rej) => db.all(`SELECT e.*, p.name as payer_name FROM expenses e JOIN participants p ON e.payer_id = p.id WHERE e.trip_id = ? ORDER BY e.date DESC`, [tripId], (err, r) => err ? rej(err) : res(r)));
    const getTrans = new Promise((res, rej) => db.all(`SELECT t.*, p1.name as from_name, p2.name as to_name FROM transfers t JOIN participants p1 ON t.from_id = p1.id JOIN participants p2 ON t.to_id = p2.id WHERE t.trip_id = ? ORDER BY t.date DESC`, [tripId], (err, r) => err ? rej(err) : res(r)));
    const getShares = new Promise((res, rej) => db.all(`SELECT es.* FROM expense_shares es JOIN expenses e ON es.expense_id = e.id WHERE e.trip_id = ?`, [tripId], (err, r) => err ? rej(err) : res(r)));

    Promise.all([getTrip, getParts, getExps, getTrans, getShares]).then(([trip, participants, expenses, transfers, shares]) => {
        if (!trip) return res.status(404).send("Not found");
        let balances = {}; 
        participants.forEach(p => balances[p.id] = 0);
        expenses.forEach(exp => {
            balances[exp.payer_id] += exp.amount;
            const expShares = shares.filter(s => s.expense_id === exp.id);
            if (expShares.length > 0) { expShares.forEach(s => balances[s.participant_id] -= s.owed_amount); }
            else { const share = exp.amount / participants.length; participants.forEach(p => balances[p.id] -= share); }
        });
        transfers.forEach(tr => { balances[tr.from_id] += tr.amount; balances[tr.to_id] -= tr.amount; });
        res.json({ trip, participants, expenses, transfers, balances });
    }).catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/trips/:id/participants', (req, res) => {
    db.run(`INSERT INTO participants (trip_id, name) VALUES (?, ?)`, [req.params.id, req.body.name], function(err) {
        if (err) return res.status(500).json(err);
        res.json({ id: this.lastID });
    });
});

app.post('/api/trips/:id/expenses', (req, res) => {
    const { payer_id, amount, description, date, split_type, custom_splits } = req.body;
    db.run(`INSERT INTO expenses (trip_id, payer_id, amount, description, date, split_type) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.params.id, payer_id, amount, description, date, split_type], function(err) {
            if (err) return res.status(500).json(err);
            const expenseId = this.lastID;
            const stmt = db.prepare(`INSERT INTO expense_shares (expense_id, participant_id, owed_amount) VALUES (?, ?, ?)`);
            if (split_type === 'equal') {
                db.all(`SELECT id FROM participants WHERE trip_id = ?`, [req.params.id], (err, parts) => {
                    const share = amount / parts.length;
                    parts.forEach(p => stmt.run(expenseId, p.id, share));
                    stmt.finalize(); res.json({ success: true });
                });
            } else {
                for (const [pid, share] of Object.entries(custom_splits)) { stmt.run(expenseId, pid, share); }
                stmt.finalize(); res.json({ success: true });
            }
        });
});

app.post('/api/trips/:id/transfers', (req, res) => {
    const { from_id, to_id, amount, date } = req.body;
    db.run(`INSERT INTO transfers (trip_id, from_id, to_id, amount, date) VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, from_id, to_id, amount, date], (err) => err ? res.status(500).json(err) : res.json({ success: true }));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
