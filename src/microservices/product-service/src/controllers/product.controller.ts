import { Request, Response } from 'express';
import { ProductService, ProductFilters } from '../services/product.service';
import { logger } from '../utils/logger';

const productService = new ProductService();

export const createProduct = async (req: Request, res: Response) => {
  try {
    const productData = req.body;
    
    // Validate required fields
    if (!productData.name || !productData.price || !productData.categoryId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, price, categoryId'
      });
    }

    const product = await productService.createProduct(productData);
    
    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error: any) {
    logger.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const filters: ProductFilters = {
      categoryId: req.query.categoryId as string,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      status: req.query.status as string,
      search: req.query.search as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      inStock: req.query.inStock === 'true',
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20
    };

    const result = await productService.getProducts(filters);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const product = await productService.getProductById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    logger.error('Get product by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const getProductBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    
    const product = await productService.getProductBySlug(slug);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    logger.error('Get product by slug error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const product = await productService.updateProduct(id, updateData);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    logger.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const success = await productService.deleteProduct(id);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Product archived successfully'
    });
  } catch (error: any) {
    logger.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const searchProducts = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    const products = await productService.searchProducts(q, 10);
    
    res.json({
      success: true,
      data: products
    });
  } catch (error: any) {
    logger.error('Search products error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const getSimilarProducts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const products = await productService.getSimilarProducts(id);
    
    res.json({
      success: true,
      data: products
    });
  } catch (error: any) {
    logger.error('Get similar products error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const updateInventory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { quantity, operation } = req.body;
    
    if (!quantity || !operation || !['add', 'subtract'].includes(operation)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body'
      });
    }
    
    const product = await productService.updateInventory(id, quantity, operation as 'add' | 'subtract');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    logger.error('Update inventory error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};
