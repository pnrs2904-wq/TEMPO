import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const sessionSyncRowSchema = z.object({
  id: uuidSchema,
  startedAt: z.union([z.string().datetime(), z.number().int().positive()]),
  phase: z.enum(['focus', 'break']),
  energy: z.number().int().min(1).max(5),
  subject: z.string().max(60),
  sessionType: z.string().max(40).default('Study'),
  plannedMinutes: z.number().int().min(1).max(360),
  actualSeconds: z.number().int().min(0).max(86400),
  status: z.enum(['active', 'paused', 'completed', 'ended_early', 'cancelled']),
  focusQuality: z.number().int().min(1).max(5).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  durationFeedback: z.enum(['not_sure', 'too_short', 'about_right', 'too_long']).nullable().optional(),
  distractions: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(240).nullable().optional(),
  updatedAt: z.union([z.string().datetime(), z.number().int().positive()]),
  deletedAt: z.union([z.string().datetime(), z.number().int().positive()]).nullable().optional()
}).strict();

export const prepEnvelopeSchema = z.object({
  table: z.enum([
    'user_exam_plans',
    'user_topic_progress',
    'revision_events',
    'mock_tests',
    'question_attempts'
  ]),
  row: z.record(z.string(), z.unknown())
}).strict();

export const syncRequestSchema = z.object({
  cursor: z.number().int().min(0).default(0),
  prepCursor: z.number().int().min(0).default(0),
  sessions: z.array(sessionSyncRowSchema).max(500).default([]),
  preferences: z.record(z.string(), z.unknown()).nullable().optional(),
  prep: z.array(prepEnvelopeSchema).max(500).default([]),
  clientPlatform: z.enum(['android', 'web', 'ios', 'other']).default('web'),
  appVersion: z.string().min(1).max(32).default('4.0.0'),
  deviceId: z.string().min(4).max(128).optional(),
  resetCursor: z.boolean().optional()
}).strict();

export const playVerifySchema = z.object({
  productId: z.enum(['pro_monthly', 'pro_annual', 'lifetime']),
  purchaseToken: z.string().min(8).max(512),
  orderId: z.string().max(128).nullable().optional(),
  packageName: z.string().max(128).optional()
}).strict();

export const razorpayCheckoutSchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_annual', 'lifetime'])
}).strict();

export const razorpayVerifySchema = z.object({
  razorpay_order_id: z.string().min(4).max(128).optional(),
  razorpay_subscription_id: z.string().min(4).max(128).optional(),
  razorpay_payment_id: z.string().min(4).max(128),
  razorpay_signature: z.string().min(16).max(256),
  plan: z.enum(['pro_monthly', 'pro_annual', 'lifetime'])
}).strict();

export const reflectionRequestSchema = z.object({
  sessions: z.array(
    z.object({
      subject: z.string().min(1).max(60),
      sessionType: z.string().max(30).optional(),
      energy: z.number().int().min(1).max(5),
      plannedMinutes: z.number().int().min(5).max(180),
      note: z.string().max(300).nullable().optional()
    }).strict()
  ).min(1).max(5),
  includeNotes: z.boolean().default(false)
}).strict();

export const deleteAccountSchema = z.object({
  confirmation: z.literal('DELETE')
}).strict();

export const setFeatureFlagSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,64}$/),
  enabled: z.boolean(),
  reason: z.string().max(200).default('')
}).strict();
