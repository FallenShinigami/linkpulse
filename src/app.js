import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import linkRoutes from './routes/linkRoutes.js';
import { LinkController } from './controllers/linkController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Link API routes
app.use('/api/links', linkRoutes);

// Explicit UI routes for welcome page and dashboard
const sendIndexHtml = (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
};

app.get(['/', '/welcome', '/dashboard'], sendIndexHtml);

// Short URL redirection endpoint
app.get('/:shortCode', LinkController.handleRedirect);

// 404 Not Found handler
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: err.name || 'Error',
    message: err.message || 'An unexpected error occurred'
  });
});

export default app;
