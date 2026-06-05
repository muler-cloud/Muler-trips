const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL;

// Пробивные настройки подключения к MongoDB Atlas
const dbOptions = {
  serverSelectionTimeoutMS: 5000, // Ждать ответа от базы не более 5 секунд (вместо 10-30)
  socketTimeoutMS: 45000,         // Закрывать зависшие соединения
};

mongoose.connect(MONGO_URI, dbOptions)
  .then(() => console.log('=== SUCCESS: Connected to MongoDB Atlas! ==='))
  .catch(err => {
    console.error('=== MONGO CONNECTION ERROR ===');
    console.error('Reason:', err.message);
  });

const TripSchema = new mongoose.Schema({
  name: { type: String, required: true },
  participants: { type: [String], default: [] },
  expenses: { type: [Array], default: [] }
});

const Trip = mongoose.model('Trip', TripSchema);

app.get('/api/trips', async (req, res) => {
  try {
    const trips = await Trip.find({}).timeoutMS(3000);
    res.json(trips || []);
  } catch (err) {
    res.status(500).json({ error: 'Database read error', details: err.message });
  }
});

app.post('/api/trips', async (req, res) => {
  try {
    console.log('Incoming trip data:', req.body);
    
    // Если база данных еще не подключилась, не тупим 10 секунд, а сразу выдаем ошибку
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not ready', 
        details: `Current connection state is ${mongoose.connection.readyState}` 
      });
    }

    const newTrip = new Trip({
      name: req.body.name || 'Новая поездка',
      participants: [],
      expenses: []
    });
    const savedTrip = await newTrip.save();
    res.json(savedTrip);
  } catch (err) {
    res.status(500).json({ error: 'Database save error', details: err.message });
  }
});

app.get('/api/trips/:id', async (req, res) => {
  try {
    if (req.params.id === 'undefined') return res.status(400).json({ error: 'Invalid ID' });
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Not found' });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.put('/api/trips/:id', async (req, res) => {
  try {
    if (req.params.id === 'undefined') return res.status(400).json({ error: 'Invalid ID' });
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Not found' });

    if (req.body.participants) trip.participants = req.body.participants;
    if (req.body.expenses) trip.expenses = req.body.expenses;

    const updatedTrip = await trip.save();
    res.json(updatedTrip);
  } catch (err) {
    res.status(500).json({ error: 'Database update error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
module.exports = app;