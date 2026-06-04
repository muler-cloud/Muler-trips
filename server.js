const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Сервер проверит все возможные варианты имени переменной в Render
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error('CRITICAL ERROR: No MongoDB connection string found in environment variables!');
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

const TripSchema = new mongoose.Schema({
  name: { type: String, required: true },
  participants: { type: [String], default: [] },
  expenses: { type: [Array], default: [] }
});

const Trip = mongoose.model('Trip', TripSchema);

app.get('/api/trips', async (req, res) => {
  try {
    const trips = await Trip.find({});
    res.json(trips || []);
  } catch (err) {
    res.status(500).json({ error: 'Database read error', details: err.message });
  }
});

app.post('/api/trips', async (req, res) => {
  try {
    console.log('Attempting to create trip with data:', req.body);
    const newTrip = new Trip({
      name: req.body.name || 'Новая поездка',
      participants: [],
      expenses: []
    });
    const savedTrip = await newTrip.save();
    console.log('Trip successfully saved:', savedTrip);
    res.json(savedTrip);
  } catch (err) {
    console.error('Failed to save trip:', err.message);
    res.status(500).json({ error: 'Database save error', details: err.message });
  }
});

app.get('/api/trips/:id', async (req, res) => {
  try {
    if (req.params.id === 'undefined') {
      return res.status(400).json({ error: 'Invalid trip ID' });
    }
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.put('/api/trips/:id', async (req, res) => {
  try {
    if (req.params.id === 'undefined') {
      return res.status(400).json({ error: 'Invalid trip ID' });
    }
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

app.listen(PORT, () => {
  console.log(`Server is running perfectly on port ${PORT}`);
});