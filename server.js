const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

let trips = [];
let participants = [];
let expenses = [];

// --- API ДЛЯ ПОЕЗДОК ---
app.get('/api/trips', (req, res) => res.json(trips));

app.post('/api/trips', (req, res) => {
    const trip = { id: Date.now().toString(), name: req.body.name };
    trips.push(trip);
    res.json(trip);
});

app.delete('/api/trips/:id', (req, res) => {
    const { id } = req.params;
    trips = trips.filter(t => t.id !== id);
    participants = participants.filter(p => p.tripId !== id);
    expenses = expenses.filter(e => e.tripId !== id);
    res.json({ success: true });
});

// --- API ДЛЯ УЧАСТНИКОВ ---
app.post('/api/trips/:tripId/participants', (req, res) => {
    const participant = { 
        id: Date.now().toString(), 
        tripId: req.params.tripId, 
        name: req.body.name 
    };
    participants.push(participant);
    res.json(participant);
});

// --- API ДЛЯ РАСХОДОВ И РАСЧЕТОВ ---
app.get('/api/trips/:tripId', (req, res) => {
    const { tripId } = req.params;
    const trip = trips.find(t => t.id === tripId);
    const tripParticipants = participants.filter(p => p.tripId === tripId);
    const tripExpenses = expenses.filter(e => e.tripId === tripId);

    // УМНЫЙ РАСЧЕТ БАЛАНСА
    const balances = {};
    tripParticipants.forEach(p => balances[p.id] = 0);

    tripExpenses.forEach(exp => {
        const amount = parseFloat(exp.amount);
        const payerId = exp.payer_id;
        
        // Кто должен участвовать в этом расходе
        // Если split_between не пришел, делим на всех (для старых записей)
        const splitBetween = exp.split_between || tripParticipants.map(p => p.id);
        const share = amount / splitBetween.length;

        // Тому, кто заплатил, прибавляем всю сумму
        if (balances.hasOwnProperty(payerId)) {
            balances[payerId] += amount;
        }

        // У каждого, кто участвует в трате, вычитаем его долю
        splitBetween.forEach(pId => {
            if (balances.hasOwnProperty(pId)) {
                balances[pId] -= share;
            }
        });
    });

    res.json({
        trip,
        participants: tripParticipants,
        expenses: tripExpenses,
        balances
    });
});

app.post('/api/trips/:tripId/expenses', (req, res) => {
    const { payer_id, amount, description, split_between } = req.body;
    const expense = {
        id: Date.now().toString(),
        tripId: req.params.tripId,
        payer_id,
        amount: parseFloat(amount),
        description,
        split_between, // Массив ID участников, за которых платят
        date: new Date().toLocaleDateString('ru-RU')
    };
    expenses.push(expense);
    res.json(expense);
});

app.listen(port, () => console.log(`Server running on port ${port}`));
