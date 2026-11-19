import { createFileRoute } from '@tanstack/react-router';

// Razorpay calls this address after a payment is captured, even if the customer closed the app.
// Dashboard setting: https://<your-live-domain>/api/public/razorpay-webhook
export const Route = createFileRoute('/api/public/razorpay-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleWebhook } = await import('@/lib/razorpay.server');
        return handleWebhook(request);
      },
    },
  },
});
