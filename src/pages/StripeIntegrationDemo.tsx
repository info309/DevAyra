import React from 'react';
import { StripeConnectButton } from '@/components/StripeConnectButton';
import { PaymentExample } from '@/components/PaymentExample';
import StripeConnectionCard from '@/components/StripeConnectionCard';

/**
 * Demo page showing the complete Stripe Connect integration flow:
 * 1. Connect Stripe account button
 * 2. Account status display
 * 3. Payment creation example
 */
const StripeIntegrationDemo = () => {
  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Stripe Connect Integration Demo</h1>
        <p className="text-muted-foreground">
          Connect your existing Stripe account and receive payments directly from clients
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Step 1: Connect Stripe Account */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">1. Connect Your Stripe Account</h2>
          <StripeConnectButton className="w-full" />
          <p className="text-sm text-muted-foreground">
            This button redirects you to Stripe OAuth where you can log into your existing 
            Stripe account or create a new Standard account.
          </p>
        </div>

        {/* Step 2: View Connection Status */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">2. Account Status</h2>
          <StripeConnectionCard />
        </div>
      </div>

      {/* Step 3: Create Payments */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">3. Create Payment with Direct Transfer</h2>
        <div className="flex justify-center">
          <PaymentExample />
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>How it works:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Creates a PaymentIntent that charges your client</li>
            <li>Transfers funds directly to your connected Stripe account using <code>transfer_data.destination</code></li>
            <li>Optionally includes a platform fee using <code>application_fee_amount</code></li>
            <li>Returns a <code>client_secret</code> for use with Stripe Elements on the client side</li>
          </ul>
        </div>
      </div>

      {/* Technical Details */}
      <div className="bg-muted/50 p-6 rounded-lg space-y-4">
        <h3 className="text-lg font-semibold">Technical Implementation</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <h4 className="font-medium mb-2">OAuth Flow</h4>
            <p className="text-sm text-muted-foreground">
              <code>create-stripe-onboarding</code> function handles the OAuth callback, 
              exchanges the authorization code for the user's Stripe account ID, and saves it to the database.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">Payment Processing</h4>
            <p className="text-sm text-muted-foreground">
              <code>create-payment-with-transfer</code> function creates PaymentIntents with 
              <code>transfer_data</code> to send funds directly to connected accounts.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">Database Storage</h4>
            <p className="text-sm text-muted-foreground">
              User's <code>stripe_account_id</code> is stored in the <code>profiles</code> table 
              and linked to their authenticated session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StripeIntegrationDemo;