const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка чтения данных
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Подключение к базе данных MongoDB Atlas
const MONGO_URI = process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Схема для поездок (как данные хранятся в базе)
const TripSchema = new mongoose.Schema({
  name: { type: String, required: true },
  participants: { type: [String], default: [] },
  expenses: { type: [Array], default: [] }
});

const Trip = mongoose.model('Trip', TripSchema);

// 1. Получить все поездки (Защищено от пустой базы)
app.get('/api/trips', async (req, res) => {
  try {
    const trips = await Trip.find({});
    res.json(trips || []);
  } catch (err) {
    res.status(500).json({ error: 'Database read error', details: err.message });
  }
});

// 2. Создать новую поездку
app.post('/api/trips', async (req, res) => {
  try {
    const newTrip = new Trip({
      name: req.body.name,
      participants: [],
      expenses: []
    });
    const savedTrip = await newTrip.save();
    res.json(savedTrip);
  } catch (err) {
    res.status(500).json({ error: 'Database save error', details: err.message });
  }
});

// 3. Получить конкретную поездку
app.get('/api/trips/:id', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// 4. Добавить участника или расход в поездку
app.put('/api/trips/:id', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    if (req.body.participants) trip.participants = req.body.participants;
    if (req.body.expenses) trip.expenses = req.body.expenses;

    const updatedTrip = await trip.save();
    res.json(updatedTrip);
  } catch (err) {
    res.status(500).json({ error: 'Database update error', details: err.message });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server is running perfectly on port ${PORT}`);
});