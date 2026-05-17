// backend/index.js — final version with all routes

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes     = require('./routes/auth');
const goalsRoutes    = require('./routes/goals');
const checkinsRoutes = require('./routes/checkins');
const adminRoutes    = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth',     authRoutes);
app.use('/api/goals',    goalsRoutes);
app.use('/api/checkins', checkinsRoutes);
app.use('/api/admin',    adminRoutes);

app.get('/', (req, res) => res.json({ message: 'Goal Tracker API running' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
