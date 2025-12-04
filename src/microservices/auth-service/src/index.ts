import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { redisClient } from './config/redis';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'auth-service' });
});

// Error handling
app.use(errorHandler);

// Connect to MongoDB
mongoose.connect(process.env.DATABASE_URL || 'mongodb://localhost:27017/auth_db')
  .then(() => {
    logger.info('Connected to MongoDB');
    
    // Connect to Redis
    redisClient.connect()
      .then(() => {
        logger.info('Connected to Redis');
        
        // Start server
        app.listen(PORT, () => {
          logger.info(`Auth service running on port ${PORT}`);
        });
      })
      .catch((error) => {
        logger.error('Redis connection error:', error);
      });
  })
  .catch((error) => {
    logger.error('MongoDB connection error:', error);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  await redisClient.quit();
  process.exit(0);
});
