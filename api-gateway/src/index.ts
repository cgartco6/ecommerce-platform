import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import winston from 'winston';
import { createClient } from 'redis';

const app = express();
const PORT = process.env.PORT || 3000;

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(limiter);

// Authentication middleware
const authenticate = async (req: any, res: any, next: any) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Service URLs
const SERVICE_URLS = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  products: process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002',
  orders: process.env.ORDER_SERVICE_URL || 'http://order-service:3003',
  payments: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3004',
  users: process.env.USER_SERVICE_URL || 'http://user-service:3005',
  shipping: process.env.SHIPPING_SERVICE_URL || 'http://shipping-service:3006',
  notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007',
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: Object.keys(SERVICE_URLS),
  });
});

// Public routes
app.use('/api/auth', createProxyMiddleware({
  target: SERVICE_URLS.auth,
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '' },
}));

// Protected routes
app.use('/api/products', createProxyMiddleware({
  target: SERVICE_URLS.products,
  changeOrigin: true,
  pathRewrite: { '^/api/products': '' },
  onProxyReq: (proxyReq, req: any) => {
    if (req.user) {
      proxyReq.setHeader('X-User-ID', req.user.userId);
      proxyReq.setHeader('X-User-Role', req.user.role);
    }
  },
}));

app.use('/api/orders', authenticate, createProxyMiddleware({
  target: SERVICE_URLS.orders,
  changeOrigin: true,
  pathRewrite: { '^/api/orders': '' },
  onProxyReq: (proxyReq, req: any) => {
    proxyReq.setHeader('X-User-ID', req.user.userId);
  },
}));

app.use('/api/payments', authenticate, createProxyMiddleware({
  target: SERVICE_URLS.payments,
  changeOrigin: true,
  pathRewrite: { '^/api/payments': '' },
  onProxyReq: (proxyReq, req: any) => {
    proxyReq.setHeader('X-User-ID', req.user.userId);
  },
}));

app.use('/api/users', authenticate, createProxyMiddleware({
  target: SERVICE_URLS.users,
  changeOrigin: true,
  pathRewrite: { '^/api/users': '' },
  onProxyReq: (proxyReq, req: any) => {
    proxyReq.setHeader('X-User-ID', req.user.userId);
  },
}));

app.use('/api/shipping', authenticate, createProxyMiddleware({
  target: SERVICE_URLS.shipping,
  changeOrigin: true,
  pathRewrite: { '^/api/shipping': '' },
  onProxyReq: (proxyReq, req: any) => {
    proxyReq.setHeader('X-User-ID', req.user.userId);
  },
}));

// Start server
app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
});

export default app;
