import Product, { IProduct } from '../models/Product';
import Category from '../models/Category';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { generateEmbedding } from '../utils/aiEmbedding';
import { publishMessage } from '../utils/rabbitmq';

export interface ProductFilters {
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
  search?: string;
  tags?: string[];
  inStock?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateProductData {
  name: string;
  description: string;
  price: number;
  quantity: number;
  categoryId: string;
  images: Array<{ url: string; alt?: string }>;
  tags?: string[];
  options?: Array<{ name: string; values: string[] }>;
  variants?: Array<{
    sku: string;
    options: Record<string, string>;
    price: number;
    quantity: number;
  }>;
}

export class ProductService {
  async createProduct(data: CreateProductData): Promise<IProduct> {
    try {
      // Check if category exists
      const category = await Category.findById(data.categoryId);
      if (!category) {
        throw new Error('Category not found');
      }

      // Generate SKU if not provided in variants
      let baseSku = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const productData: any = {
        ...data,
        sku: baseSku,
        status: 'active',
        hasVariants: !!(data.variants && data.variants.length > 0)
      };

      // Generate AI tags
      const aiTags = await this.generateAITags(data.name, data.description);
      productData.aiTags = aiTags;

      // Generate search embedding
      const embedding = await generateEmbedding(`${data.name} ${data.description} ${aiTags.join(' ')}`);
      productData.searchEmbedding = embedding;

      // Create product
      const product = new Product(productData);
      await product.save();

      // Invalidate cache
      await this.invalidateProductCache();

      // Publish product created event
      await publishMessage('product.created', {
        productId: product._id,
        sku: product.sku,
        name: product.name,
        price: product.price
      });

      logger.info(`Product created: ${product._id}`);
      return product;

    } catch (error: any) {
      logger.error('Error creating product:', error);
      throw error;
    }
  }

  async getProducts(filters: ProductFilters = {}): Promise<{
    products: IProduct[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        categoryId,
        minPrice,
        maxPrice,
        status,
        search,
        tags,
        inStock,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 20
      } = filters;

      const skip = (page - 1) * limit;

      // Build query
      const query: any = { status: 'active' };

      if (categoryId) {
        query.categoryId = categoryId;
      }

      if (minPrice !== undefined) {
        query.price = { ...query.price, $gte: minPrice };
      }

      if (maxPrice !== undefined) {
        query.price = { ...query.price, $lte: maxPrice };
      }

      if (status) {
        query.status = status;
      }

      if (inStock) {
        query.quantity = { $gt: 0 };
      }

      if (tags && tags.length > 0) {
        query.tags = { $in: tags };
      }

      if (search) {
        query.$text = { $search: search };
      }

      // Build sort
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [products, total] = await Promise.all([
        Product.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('categoryId', 'name slug')
          .populate('subcategoryId', 'name slug')
          .lean(),
        Product.countDocuments(query)
      ]);

      return {
        products,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };

    } catch (error: any) {
      logger.error('Error getting products:', error);
      throw error;
    }
  }

  async getProductById(id: string): Promise<IProduct | null> {
    try {
      // Try cache first
      const cacheKey = `product:${id}`;
      const cachedProduct = await redisClient.get(cacheKey);
      
      if (cachedProduct) {
        return JSON.parse(cachedProduct);
      }

      // Get from database
      const product = await Product.findById(id)
        .populate('categoryId', 'name slug')
        .populate('subcategoryId', 'name slug')
        .populate('supplierId', 'name email');

      if (product) {
        // Update view count
        await Product.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });

        // Cache for 1 hour
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(product));
      }

      return product;

    } catch (error: any) {
      logger.error('Error getting product by ID:', error);
      throw error;
    }
  }

  async getProductBySlug(slug: string): Promise<IProduct | null> {
    try {
      const cacheKey = `product:slug:${slug}`;
      const cachedProduct = await redisClient.get(cacheKey);
      
      if (cachedProduct) {
        return JSON.parse(cachedProduct);
      }

      const product = await Product.findOne({ slug, status: 'active' })
        .populate('categoryId', 'name slug')
        .populate('subcategoryId', 'name slug');

      if (product) {
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(product));
        await Product.findByIdAndUpdate(product._id, { $inc: { viewCount: 1 } });
      }

      return product;

    } catch (error: any) {
      logger.error('Error getting product by slug:', error);
      throw error;
    }
  }

  async updateProduct(id: string, data: Partial<CreateProductData>): Promise<IProduct | null> {
    try {
      const product = await Product.findById(id);
      if (!product) {
        return null;
      }

      // Update fields
      Object.keys(data).forEach(key => {
        if (data[key as keyof CreateProductData] !== undefined) {
          (product as any)[key] = data[key as keyof CreateProductData];
        }
      });

      // Regenerate AI tags if name or description changed
      if (data.name || data.description) {
        const aiTags = await this.generateAITags(
          data.name || product.name,
          data.description || product.description
        );
        product.aiTags = aiTags;

        // Regenerate embedding
        const embedding = await generateEmbedding(
          `${product.name} ${product.description} ${aiTags.join(' ')}`
        );
        product.searchEmbedding = embedding;
      }

      await product.save();

      // Invalidate cache
      await Promise.all([
        redisClient.del(`product:${id}`),
        redisClient.del(`product:slug:${product.slug}`),
        this.invalidateProductCache()
      ]);

      // Publish update event
      await publishMessage('product.updated', {
        productId: product._id,
        sku: product.sku,
        name: product.name,
        price: product.price
      });

      logger.info(`Product updated: ${id}`);
      return product;

    } catch (error: any) {
      logger.error('Error updating product:', error);
      throw error;
    }
  }

  async deleteProduct(id: string): Promise<boolean> {
    try {
      const product = await Product.findByIdAndUpdate(
        id,
        { status: 'archived' },
        { new: true }
      );

      if (!product) {
        return false;
      }

      // Invalidate cache
      await Promise.all([
        redisClient.del(`product:${id}`),
        redisClient.del(`product:slug:${product.slug}`),
        this.invalidateProductCache()
      ]);

      // Publish delete event
      await publishMessage('product.archived', {
        productId: product._id,
        sku: product.sku
      });

      logger.info(`Product archived: ${id}`);
      return true;

    } catch (error: any) {
      logger.error('Error deleting product:', error);
      throw error;
    }
  }

  async updateInventory(productId: string, quantity: number, operation: 'add' | 'subtract'): Promise<IProduct | null> {
    try {
      const update = operation === 'add' 
        ? { $inc: { quantity } }
        : { $inc: { quantity: -quantity } };

      const product = await Product.findByIdAndUpdate(
        productId,
        update,
        { new: true }
      );

      if (product) {
        // Update status if out of stock
        if (product.quantity <= 0 && product.status !== 'out_of_stock') {
          product.status = 'out_of_stock';
          await product.save();
        } else if (product.quantity > 0 && product.status === 'out_of_stock') {
          product.status = 'active';
          await product.save();
        }

        // Invalidate cache
        await redisClient.del(`product:${productId}`);

        // Publish inventory update event
        await publishMessage('inventory.updated', {
          productId: product._id,
          sku: product.sku,
          newQuantity: product.quantity,
          status: product.status
        });
      }

      return product;

    } catch (error: any) {
      logger.error('Error updating inventory:', error);
      throw error;
    }
  }

  async searchProducts(query: string, limit: number = 10): Promise<IProduct[]> {
    try {
      // Text search
      const products = await Product.find(
        { $text: { $search: query }, status: 'active' },
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .select('name price images slug')
        .lean();

      return products;

    } catch (error: any) {
      logger.error('Error searching products:', error);
      throw error;
    }
  }

  async getSimilarProducts(productId: string, limit: number = 5): Promise<IProduct[]> {
    try {
      const product = await Product.findById(productId).select('searchEmbedding categoryId');
      if (!product || !product.searchEmbedding) {
        return [];
      }

      // Using vector similarity search
      // This is a simplified version - in production, use a vector database like Pinecone
      const similarProducts = await Product.aggregate([
        {
          $match: {
            _id: { $ne: product._id },
            status: 'active',
            searchEmbedding: { $exists: true }
          }
        },
        {
          $addFields: {
            similarity: {
              $sqrt: {
                $reduce: {
                  input: { $range: [0, { $size: "$searchEmbedding" }] },
                  initialValue: 0,
                  in: {
                    $add: [
                      "$$value",
                      {
                        $pow: [
                          { $subtract: [
                              { $arrayElemAt: ["$searchEmbedding", "$$this"] },
                              { $arrayElemAt: [product.searchEmbedding, "$$this"] }
                            ]
                          },
                          2
                        ]
                      }
                    ]
                  }
                }
              }
            }
          }
        },
        { $sort: { similarity: 1 } },
        { $limit: limit },
        {
          $project: {
            name: 1,
            price: 1,
            images: 1,
            slug: 1,
            similarityScore: "$similarity"
          }
        }
      ]);

      return similarProducts;

    } catch (error: any) {
      logger.error('Error getting similar products:', error);
      throw error;
    }
  }

  private async generateAITags(name: string, description: string): Promise<string[]> {
    try {
      // In production, integrate with OpenAI, Google Cloud AI, etc.
      // This is a simplified implementation
      
      const text = `${name} ${description}`.toLowerCase();
      const tags: string[] = [];
      
      // Extract keywords (simplified)
      const words = text.split(/\W+/).filter(word => word.length > 3);
      const wordFrequency: Record<string, number> = {};
      
      words.forEach(word => {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      });
      
      // Get top keywords
      const sortedWords = Object.entries(wordFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);
      
      tags.push(...sortedWords);
      
      // Add category-based tags
      // This would be enhanced with AI in production
      
      return tags;

    } catch (error) {
      logger.error('Error generating AI tags:', error);
      return [];
    }
  }

  private async invalidateProductCache(): Promise<void> {
    try {
      // Invalidate product listing caches
      const cacheKeys = await redisClient.keys('products:*');
      if (cacheKeys.length > 0) {
        await redisClient.del(cacheKeys);
      }
    } catch (error) {
      logger.error('Error invalidating product cache:', error);
    }
  }
}
