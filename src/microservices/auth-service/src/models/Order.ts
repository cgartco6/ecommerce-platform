import mongoose, { Document, Schema } from 'mongoose';

export interface IOrder extends Document {
  _id: string;
  orderNumber: string;
  userId: string;
  customerEmail: string;
  customerPhone?: string;
  
  // Shipping
  shippingAddress: {
    firstName: string;
    lastName: string;
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    phone: string;
  };
  
  // Billing
  billingAddress: {
    firstName: string;
    lastName: string;
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  
  // Items
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    variant?: {
      id: string;
      options: Record<string, string>;
    };
    image?: string;
  }>;
  
  // Pricing
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  
  // Payment
  paymentMethod: 'credit_card' | 'paypal' | 'bank_transfer' | 'cod';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentId?: string;
  paymentDetails?: Record<string, any>;
  
  // Shipping
  shippingMethod: string;
  shippingProvider?: string;
  trackingNumber?: string;
  shippingStatus: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  
  // Order status
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  
  // Dates
  placedAt: Date;
  confirmedAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  
  // Notes
  customerNotes?: string;
  internalNotes?: string;
  
  // Fraud detection
  fraudScore?: number;
  fraudFlags?: string[];
  isFlagged: boolean;
  
  // Analytics
  source: 'web' | 'mobile' | 'api';
  ipAddress?: string;
  userAgent?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema = new Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  customerEmail: {
    type: String,
    required: true,
    index: true
  },
  customerPhone: String,
  
  shippingAddress: {
    firstName: String,
    lastName: String,
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String,
    phone: String
  },
  
  billingAddress: {
    firstName: String,
    lastName: String,
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  
  items: [{
    productId: {
      type: String,
      required: true
    },
    sku: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    variant: {
      id: String,
      options: Schema.Types.Mixed
    },
    image: String
  }],
  
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  shippingCost: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    required: true,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'paypal', 'bank_transfer', 'cod'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },
  paymentId: String,
  paymentDetails: Schema.Types.Mixed,
  
  shippingMethod: {
    type: String,
    required: true
  },
  shippingProvider: String,
  trackingNumber: {
    type: String,
    index: true
  },
  shippingStatus: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  
  placedAt: {
    type: Date,
    default: Date.now
  },
  confirmedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  
  customerNotes: String,
  internalNotes: String,
  
  fraudScore: Number,
  fraudFlags: [String],
  isFlagged: {
    type: Boolean,
    default: false
  },
  
  source: {
    type: String,
    enum: ['web', 'mobile', 'api'],
    default: 'web'
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Indexes
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, paymentStatus: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ 'items.productId': 1 });

// Pre-save middleware to generate order number
OrderSchema.pre('save', function(next) {
  if (this.isNew) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    this.orderNumber = `ORD-${year}${month}${day}-${random}`;
  }
  next();
});

export default mongoose.model<IOrder>('Order', OrderSchema);
