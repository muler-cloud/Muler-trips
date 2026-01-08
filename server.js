const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const db = new sqlite3.Database('./tripdata.db'); // Файл БД создастся сам

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Инициализация БД ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        name TEXT,
        location TEXT,
        start_date TEXT,
        end_date TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT,
        name TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT,
        payer_id INTEGER,
        amount REAL,
        description TEXT,
        date TEXT,
        split_type TEXT DEFAULT 'equal'
    )`);
    // Таблица для кастомных долей (кто сколько должен за конкретный расход)
    db.run(`CREATE TABLE IF NOT EXISTS expense_shares (
        expense_id INTEGER,
        participant_id INTEGER,
        owed_amount REAL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT,
        from_id INTEGER,
        to_id INTEGER,
        amount REAL,
        date TEXT
    )`);
});

// --- API Роуты ---

// Создать поездку
app.post('/api/trips', (req, res) => {
    const { name, location, start_date, end_date } = req.body;
    const id = uuidv4();
    db.run(`INSERT INTO trips (id, name, location, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
        [id, name, location, start_date, end_date],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id });
        });
});

// Получить данные поездки (включая расчеты)
app.get('/api/trips/:id', (req, res) => {
    const tripId = req.params.id;
    
    // Получаем всё параллельно
    const getTrip = new Promise((resolve, reject) => {
        db.get(`SELECT * FROM trips WHERE id = ?`, [tripId], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });

    const getParticipants = new Promise((resolve, reject) => {
        db.all(`SELECT * FROM participants WHERE trip_id = ?`, [tripId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });

    const getExpenses = new Promise((resolve, reject) => {
        db.all(`SELECT e.*, p.name as payer_name FROM expenses e JOIN participants p ON e.payer_id = p.id WHERE e.trip_id = ? ORDER BY e.date DESC, e.id DESC`, [tripId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });

    const getTransfers = new Promise((resolve, reject) => {
        db.all(`SELECT t.*, p1.name as from_name, p2.name as to_name FROM transfers t 
                JOIN participants p1 ON t.from_id = p1.id 
                JOIN participants p2 ON t.to_id = p2.id 
                WHERE t.trip_id = ? ORDER BY t.date DESC`, [tripId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });

    const getShares = new Promise((resolve, reject) => {
        // Получаем все доли расходов для этой поездки
        db.all(`SELECT es.* FROM expense_shares es 
                JOIN expenses e ON es.expense_id = e.id 
                WHERE e.trip_id = ?`, [tripId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });

    Promise.all([getTrip, getParticipants, getExpenses, getTransfers, getShares])
        .then(([trip, participants, expenses, transfers, shares]) => {
            if (!trip) return res.status(404).json({ error: "Trip not found" });

            // Логика дат (если не заданы, берем из расходов)
            if (!trip.start_date || !trip.end_date) {
                const dates = expenses.map(e => e.date).filter(d => d).sort();
                if (dates.length > 0) {
                    trip.computed_start = dates[0];
                    trip.computed_end = dates[dates.length - 1];
                }
            }

            // --- Расчет долгов (Алгоритм) ---
            let balances = {}; 
            participants.forEach(p => balances[p.id] = 0);

            // 1. Обработка расходов
            expenses.forEach(exp => {
                balances[exp.payer_id] += exp.amount; // Плательщик получает "плюс" (ему должны)
                
                // Кто должен?
                const expShares = shares.filter(s => s.expense_id === exp.id);
                if (expShares.length > 0) {
                    // Кастомный сплит или уже посчитанный равный
                    expShares.forEach(s => {
                        balances[s.participant_id] -= s.owed_amount;
                    });
                } else {
                    // Fallback (если вдруг нет записей shares, делим поровну на всех)
                    const share = exp.amount / participants.length;
                    participants.forEach(p => balances[p.id] -= share);
                }
            });

            // 2. Обработка переводов (погашение долгов)
            transfers.forEach(tr => {
                balances[tr.from_id] += tr.amount; // Отправитель "погасил" (ему как бы возвращается баланс)
                balances[tr.to_id] -= tr.amount;   // Получатель "получил" (его плюс уменьшается)
            });

            // Формируем матрицу "кто кому"
            // Упрощенная матрица: просто баланс каждого
            // Сложная матрица: детальный расчет (Min-Cash-Flow algorithm упрощенный)
            
            res.json({ trip, participants, expenses, transfers, balances });
        })
        .catch(err => res.status(500).json({ error: err.message }));
});

// Добавить участника
app.post('/api/trips/:id/participants', (req, res) => {
    db.run(`INSERT INTO participants (trip_id, name) VALUES (?, ?)`, 
        [req.params.id, req.body.name], function(err) {
            if (err) return res.status(500).json(err);
            res.json({ id: this.lastID });
    });
});

// Добавить расход
app.post('/api/trips/:id/expenses', (req, res) => {
    const { payer_id, amount, description, date, split_type, custom_splits } = req.body; // custom_splits = { userId: amount, ... }
    
    db.run(`INSERT INTO expenses (trip_id, payer_id, amount, description, date, split_type) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.params.id, payer_id, amount, description, date, split_type],
        function(err) {
            if (err) return res.status(500).json(err);
            const expenseId = this.lastID;

            // Сохраняем доли (shares)
            const stmt = db.prepare(`INSERT INTO expense_shares (expense_id, participant_id, owed_amount) VALUES (?, ?, ?)`);
            
            if (split_type === 'equal') {
                // Нужно получить кол-во участников, чтобы поделить
                db.all(`SELECT id FROM participants WHERE trip_id = ?`, [req.params.id], (err, parts) => {
                    const share = amount / parts.length;
                    parts.forEach(p => stmt.run(expenseId, p.id, share));
                    stmt.finalize();
                    res.json({ success: true });
                });
            } else {
                // Custom split
                for (const [pid, share] of Object.entries(custom_splits)) {
                    stmt.run(expenseId, pid, share);
                }
                stmt.finalize();
                res.json({ success: true });
            }
        });
});

// Добавить перевод
app.post('/api/trips/:id/transfers', (req, res) => {
    const { from_id, to_id, amount, date } = req.body;
    db.run(`INSERT INTO transfers (trip_id, from_id, to_id, amount, date) VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, from_id, to_id, amount, date],
        function(err) {
            if (err) return res.status(500).json(err);
            res.json({ success: true });
    });
});

// Главная (отдает HTML) для любого пути (SPA-like)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});