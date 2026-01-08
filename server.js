const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

// ЗАМЕНИ ЭТУ СТРОКУ на свою ссылку из MongoDB Atlas (или используй переменную окружения)
const MONGO_URI = process.env.MONGODB_URI || "ТВОЯ_ССЫЛКА_ИЗ_MONGODB_ATLAS";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB!'))
  .catch(err => console.error('Could not connect to MongoDB', err));

app.use(bodyParser.json());
app.use(express.static('public'));

// --- СХЕМЫ ДАННЫХ ---
const TripSchema = new mongoose.Schema({ name: String });
const Trip = mongoose.model('Trip', TripSchema);

const ParticipantSchema = new mongoose.Schema({ tripId: String, name: String });
const Participant = mongoose.model('Participant', ParticipantSchema);

const ExpenseSchema = new mongoose.Schema({
    tripId: String,
    payer_id: String,
    amount: Number,
    description: String,
    split_between: [String],
    date: { type: String, default: () => new Date().toLocaleDateString('ru-RU') }
});
const Expense = mongoose.model('Expense', ExpenseSchema);

// --- API ---

app.get('/api/trips', async (req, res) => {
    const trips = await Trip.find();
    res.json(trips);
});

app.post('/api/trips', async (req, res) => {
    const trip = new Trip({ name: req.body.name });
    await trip.save();
    res.json(trip);
});

app.delete('/api/trips/:id', async (req, res) => {
    await Trip.findByIdAndDelete(req.params.id);
    await Participant.deleteMany({ tripId: req.params.id });
    await Expense.deleteMany({ tripId: req.params.id });
    res.json({ success: true });
});

app.post('/api/trips/:tripId/participants', async (req, res) => {
    const participant = new Participant({ tripId: req.params.tripId, name: req.body.name });
    await participant.save();
    res.json(participant);
});

app.get('/api/trips/:tripId', async (req, res) => {
    const { tripId } = req.params;
    const trip = await Trip.findById(tripId);
    const tripParts = await Participant.find({ tripId });
    const tripExps = await Expense.find({ tripId });

    const balances = {};
    tripParts.forEach(p => balances[p.id] = 0);

    tripExps.forEach(exp => {
        const amount = exp.amount;
        const payerId = exp.payer_id;
        const splitBetween = (exp.split_between && exp.split_between.length > 0) 
            ? exp.split_between 
            : tripParts.map(p => p.id);
        const share = amount / splitBetween.length;

        if (balances.hasOwnProperty(payerId)) balances[payerId] += amount;
        splitBetween.forEach(pId => {
            if (balances.hasOwnProperty(pId)) balances[pId] -= share;
        });
    });

    // Алгоритм долгов (тот же самый)
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

app.post('/api/trips/:tripId/expenses', async (req, res) => {
    const expense = new Expense({
        tripId: req.params.tripId,
        payer_id: req.body.payer_id,
        amount: parseFloat(req.body.amount),
        description: req.body.description,
        split_between: req.body.split_between
    });
    await expense.save();
    res.json(expense);
});

app.listen(port, () => console.log(`Server connected to DB and running on ${port}`));
