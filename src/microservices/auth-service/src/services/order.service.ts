import Order, { IOrder } from '../models/Order';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { publishMessage } from '../utils/rabbitmq';
import axios from 'axios';

export interface CreateOrderData {
  userId: string;
  customerEmail: string;
  customerPhone?: string;
  shippingAddress: any;
  billingAddress?: any;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    variant?: any;
  }>;
  paymentMethod: string;
  shippingMethod: string;
  customerNotes?: string;
  source?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface OrderUpdateData {
  status?: string;
  paymentStatus?: string;
  shippingStatus?: string;
  trackingNumber?: string;
  internalNotes?: string;
}

export class OrderService {
  async createOrder(data: CreateOrderData): Promise<IOrder> {
    try {
      // Validate items availability (would call inventory service)
      const inventoryCheck = await this.checkInventoryAvailability(data.items);
      if (!inventoryCheck.available) {
        throw new Error(`Insufficient inventory for product: ${inventoryCheck.unavailableItems.join(', ')}`);
      }

      // Calculate pricing
      const pricing = await this.calculateOrderPricing(data);

      // Create order
      const orderData: any = {
        ...data,
        ...pricing,
        status: 'pending',
        paymentStatus: 'pending',
        shippingStatus: 'pending'
      };

      const order = new Order(orderData);
      await order.save();

      // Reserve inventory
      await this.reserveInventory(order.items);

      // Invalidate cache
      await this.invalidateOrderCache(order.userId);

      // Publish order created event
      await publishMessage('order.created', {
        orderId: order._id,
        orderNumber: order.orderNumber,
