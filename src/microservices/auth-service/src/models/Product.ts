import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  _id: string;
  sku: string;
  name: string;
  description: string;
  shortDescription?: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  quantity: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  
  // Categories
  categoryId: mongoose.Types.ObjectId;
  subcategoryId?: mongoose.Types.ObjectId;
  tags: string[];
  
  // Media
  images: Array<{
    url: string;
    alt?: string;
    isPrimary: boolean;
  }>;
  videos?: Array<{
    url: string;
    type: string;
  }>;
  
  // SEO
  seoTitle?: string;
  seoDescription?: string;
  slug: string;
  
  // Variants
  hasVariants: boolean;
  variants?: Array<{
    sku: string;
    options: Map<string, string>;
    price: number;
    quantity: number;
    images?: string[];
  }>;
  
  // Options for variants
  options?: Array<{
    name: string;
    values: string[];
  }>;
  
  // Supplier
  supplierId?: mongoose.Types.ObjectId;
  supplierSku?: string;
  
  // Status
  status: 'draft' | 'active' | 'archived' | 'out_of_stock';
  
  // AI Fields
  aiTags?: string[];
  searchEmbedding?: number[];
  similarityScore?: number;
  
  // Analytics
  viewCount: number;
  purchaseCount: number;
  wishlistCount: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

const ProductSchema: Schema = new Schema({
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  shortDescription: {
    type: String,
    maxlength: 200
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  compareAtPrice: {
    type: Number,
    min: 0
  },
  costPrice: {
    type: Number,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  weight: Number,
  length: Number,
  width: Number,
  height: Number,
  
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
    index: true
  },
  subcategoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Category'
  },
  tags: [{
    type: String,
    index: true
  }],
  
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  videos: [{
    url: String,
    type: String
  }],
  
  seoTitle: String,
  seoDescription: String,
  slug: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  hasVariants: {
    type: Boolean,
    default: false
  },
  variants: [{
    sku: {
      type: String,
      required: true,
      uppercase: true
    },
    options: {
      type: Map,
      of: String
    },
    price: Number,
    quantity: Number,
    images: [String]
  }],
  
  options: [{
    name: String,
    values: [String]
  }],
  
  supplierId: {
    type: Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplierSku: String,
  
  status: {
    type: String,
    enum: ['draft', 'active', 'archived', 'out_of_stock'],
    default: 'draft',
    index: true
  },
  
  aiTags: [String],
  searchEmbedding: [Number],
  similarityScore: Number,
  
  viewCount: {
    type: Number,
    default: 0
  },
  purchaseCount: {
    type: Number,
    default: 0
  },
  wishlistCount: {
    type: Number,
    default: 0
  },
  
  publishedAt: Date
}, {
  timestamps: true
});

// Indexes for search
ProductSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  aiTags: 'text'
});

// Compound indexes for common queries
ProductSchema.index({ categoryId: 1, status: 1, price: 1 });
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ slug: 1, status: 1 });

// Pre-save middleware to generate slug
ProductSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
  next();
});

export default mongoose.model<IProduct>('Product', ProductSchema);
