import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { sendVerificationEmail } from '../services/email.service';
import { redisClient } from '../config/redis';
import { generateOTP } from '../utils/otpGenerator';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d';
const REFRESH_TOKEN_EXPIRES_IN = '30d';

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phoneNumber } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User already exists' 
      });
    }

    // Create new user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      phoneNumber
    });

    await user.save();

    // Generate verification token
    const verificationToken = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Store verification token in Redis
    await redisClient.setEx(
      `verify:${user._id}`,
      86400, // 24 hours
      verificationToken
    );

    // Send verification email
    await sendVerificationEmail(user.email, verificationToken);

    // Generate access and refresh tokens
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // Store refresh token in Redis
    await redisClient.setEx(
      `refresh:${user._id}`,
      30 * 86400, // 30 days
      refreshToken
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email.',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: JWT_EXPIRES_IN
        }
      }
    });

  } catch (error: any) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email first'
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // Store refresh token in Redis
    await redisClient.setEx(
      `refresh:${user._id}`,
      30 * 86400,
      refreshToken
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: JWT_EXPIRES_IN
        }
      }
    });

  } catch (error: any) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).user;
    
    // Remove refresh token from Redis
    await redisClient.del(`refresh:${userId}`);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error: any) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId: string };
    
    // Check if refresh token exists in Redis
    const storedToken = await redisClient.get(`refresh:${decoded.userId}`);
    
    if (storedToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
    
    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        expiresIn: JWT_EXPIRES_IN
      }
    });
    
  } catch (error: any) {
    logger.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token as string, JWT_SECRET) as { userId: string, email: string };
    
    // Check if token exists in Redis
    const storedToken = await redisClient.get(`verify:${decoded.userId}`);
    
    if (storedToken !== token) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }
    
    // Update user
    await User.findByIdAndUpdate(decoded.userId, {
      isEmailVerified: true
    });
    
    // Remove token from Redis
    await redisClient.del(`verify:${decoded.userId}`);
    
    res.json({
      success: true,
      message: 'Email verified successfully'
    });
    
  } catch (error: any) {
    logger.error('Email verification error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid or expired verification token'
    });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP in Redis (5 minutes expiry)
    await redisClient.setEx(
      `reset:${user._id}`,
      300,
      otp
    );
    
    // Send OTP via email/SMS
    // TODO: Implement email/SMS service
    
    res.json({
      success: true,
      message: 'Password reset OTP sent'
    });
    
  } catch (error: any) {
    logger.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
