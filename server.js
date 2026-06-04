const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

// Использует переменную из Render, либо твою прямую ссылку
const MONGO_URI = process.env.MONGODB_URI || "ТВОЯ_ССЫЛКА_ИЗ_MONGODB_ATLAS";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas!'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use(bodyParser.json());
app.use(express.static('public'));

// МОДЕЛИ
const Trip = mongoose.model('Trip', new mongoose.Schema({ name: String }));
const Participant = mongoose.model('Participant', new mongoose.Schema({ tripId: String, name: String }));
const Expense = mongoose.model('Expense', new mongoose.Schema({
    tripId: String,
    payer_id: String,
    amount: Number,
    description: String,
    split_between: [String]
}));

// API ПОЕЗДОК
app.get('/api/trips', async (req, res) => {
    try {
        const trips = await Trip.find();
        res.json(trips.map(t => ({ id: t._id.toString(), name: t.name })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trips', async (req, res) => {
    try {
        const trip = new Trip({ name: req.body.name });
        await trip.save();
        res.json({ id: trip._id.toString(), name: trip.name });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/trips/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Trip.findByIdAndDelete(id);
        await Participant.deleteMany({ tripId: id });
        await Expense.deleteMany({ tripId: id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API УЧАСТНИКОВ
app.post('/api/trips/:tripId/participants', async (req, res) => {
    try {
        const participant = new Participant({ tripId: req.params.tripId, name: req.body.name });
        await participant.save();
        res.json({ id: participant._id.toString(), name: participant.name });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API РАСЧЕТОВ
app.get('/api/trips/:tripId', async (req, res) => {
    try {
        const { tripId } = req.params;
        const trip = await Trip.findById(tripId);
        const tripParts = await Participant.find({ tripId });
        const tripExps = await Expense.find({ tripId });

        const formattedParts = tripParts.map(p => ({ id: p._id.toString(), name: p.name }));
        const balances = {};
        formattedParts.forEach(p => balances[p.id] = 0);

        tripExps.forEach(exp => {
            const amount = exp.amount;
            const payerId = exp.payer_id;
            const splitBetween = (exp.split_between && exp.split_between.length > 0) 
                ? exp.split_between 
                : formattedParts.map(p => p.id);
            const share = amount / splitBetween.length;

            if (balances.hasOwnProperty(payerId)) balances[payerId] += amount;
            splitBetween.forEach(pId => {
                if (balances.hasOwnProperty(pId)) balances[pId] -= share;
            });
        });

        const debts = [];
        const debtors = [], creditors = [];
        Object.keys(balances).forEach(id => {
            const b = balances[id];
            const name = formattedParts.find(p => p.id === id)?.name;
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

        res.json({ 
            trip: { id: trip._id.toString(), name: trip.name }, 
            participants: formattedParts, 
            expenses: tripExps, 
            balances, 
            debts 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trips/:tripId/expenses', async (req, res) => {
    try {
        const expense = new Expense({
            tripId: req.params.tripId,
            payer_id: req.body.payer_id,
            amount: parseFloat(req.body.amount),
            description: req.body.description,
            split_between: req.body.split_between
        });
        await expense.save();
        res.json(expense);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => console.log(`Server running on port ${port}`));