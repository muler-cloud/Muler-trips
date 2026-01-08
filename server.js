const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

let trips = [];
let participants = [];
let expenses = [];

// API ПОЕЗДОК
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

// API УЧАСТНИКОВ
app.post('/api/trips/:tripId/participants', (req, res) => {
    const participant = { id: Date.now().toString(), tripId: req.params.tripId, name: req.body.name };
    participants.push(participant);
    res.json(participant);
});

// API ДЕТАЛЕЙ И РАСЧЕТОВ
app.get('/api/trips/:tripId', (req, res) => {
    const { tripId } = req.params;
    const trip = trips.find(t => t.id === tripId);
    const tripParts = participants.filter(p => p.tripId === tripId);
    const tripExps = expenses.filter(e => e.tripId === tripId);

    const balances = {};
    tripParts.forEach(p => balances[p.id] = 0);

    tripExps.forEach(exp => {
        const amount = parseFloat(exp.amount);
        const payerId = exp.payer_id;
        const splitBetween = exp.split_between || tripParts.map(p => p.id);
        const share = amount / splitBetween.length;

        if (balances.hasOwnProperty(payerId)) balances[payerId] += amount;
        splitBetween.forEach(pId => {
            if (balances.hasOwnProperty(pId)) balances[pId] -= share;
        });
    });

    // Расчет "Кто кому должен"
    const debts = [];
    const debtors = [], creditors = [];
    Object.keys(balances).forEach(id => {
        const b = balances[id];
        const name = tripParts.find(p => p.id === id)?.name;
        if (b < -0.01) debtors.push({ name, amount: Math.abs(b) });
        else if (b > 0.01) creditors.push({ name, amount: b });
    });

    let i = 0, j = 0;
    while(i < debtors.length && j < creditors.length) {
        const pay = Math.min(debtors[i].amount, creditors[j].amount);
        debts.push({ from: debtors[i].name, to: creditors[j].name, amount: pay.toFixed(2) });
        debtors[i].amount -= pay; creditors[j].amount -= pay;
        if(debtors[i].amount < 0.01) i++;
        if(creditors[j].amount < 0.01) j++;
    }

    res.json({ trip, participants: tripParts, expenses: tripExps, balances, debts });
});

app.post('/api/trips/:tripId/expenses', (req, res) => {
    const expense = {
        id: Date.now().toString(),
        tripId: req.params.tripId,
        payer_id: req.body.payer_id,
        amount: parseFloat(req.body.amount),
        description: req.body.description,
        split_between: req.body.split_between,
        date: new Date().toLocaleDateString('ru-RU')
    };
    expenses.push(expense);
    res.json(expense);
});

app.listen(port, () => console.log(`Server on ${port}`));
